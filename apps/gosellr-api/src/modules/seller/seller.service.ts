import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Seller, SellerDocument } from './seller.schema';
import { Product, ProductDocument } from '../products/product.schema';
import { PssClientService } from '../pss-client/pss-client.service';
import { JpsClientService } from '../jps-client/jps-client.service';
import { FranchisesClientService } from '../franchises-client/franchises-client.service';

export interface CreateSellerDto {
  user_id: string;
  business_name: string;
  business_type: string;
  business_category: string;
  store_description?: string;
  /** Optional store geolocation - when present, the new seller is forwarded to
   *  ehb-franchises for auto-creation/assignment to a Sub franchise. */
  store_lat?: number;
  store_lng?: number;
}

export interface UpdateSellerDto {
  business_name?: string;
  business_type?: string;
  business_category?: string;
  store_description?: string;
  store_logo_url?: string;
  document_urls?: string[];
  bank_info?: {
    bank_name: string;
    account_title: string;
    account_number: string;
    iban: string;
  };
}

@Injectable()
export class SellerService {
  private readonly logger = new Logger(SellerService.name);

  constructor(
    @InjectModel(Seller.name) private readonly sellerModel: Model<SellerDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    private readonly pssClient: PssClientService,
    private readonly jpsClient: JpsClientService,
    private readonly franchisesClient: FranchisesClientService,
  ) {}

  async create(dto: CreateSellerDto): Promise<SellerDocument> {
    const existing = await this.sellerModel.findOne({
      user_id: new Types.ObjectId(dto.user_id),
    }).exec();
    if (existing) throw new ConflictException('Seller profile already exists for this account');

    const hasLocation =
      typeof dto.store_lat === 'number' && typeof dto.store_lng === 'number';

    const sellerDoc: Record<string, unknown> = {
      user_id: new Types.ObjectId(dto.user_id),
      business_name: dto.business_name,
      business_type: dto.business_type,
      business_category: dto.business_category,
      store_description: dto.store_description ?? '',
    };
    // Only set store_location when we actually have coords - Mongoose 8 won't
    // accept `null` for an embedded GeoJSON subdocument, but omitting the field
    // leaves it undefined which it handles cleanly.
    if (hasLocation) {
      sellerDoc.store_location = {
        type: 'Point',
        coordinates: [dto.store_lng as number, dto.store_lat as number],
      };
    }
    const seller = new this.sellerModel(sellerDoc);
    const saved = await seller.save();
    // PSS verification is NOT submitted automatically.
    // The seller must manually trigger it via POST /seller/pss-submit.

    // Phase 2 franchise integration: notify ehb-franchises so it can run the
    // auto-creation pipeline. Fire-and-forget - registration never fails just
    // because franchises is down.
    if (hasLocation) {
      void this.franchisesClient.notifyStoreRegistered({
        store_id: (saved._id as unknown as { toString(): string }).toString(),
        lat: dto.store_lat as number,
        lng: dto.store_lng as number,
        store_name: dto.business_name,
      });
    } else {
      this.logger.warn(
        `Seller ${saved._id} registered without store_location - skipping franchises notify`,
      );
    }

    return saved;
  }

  async findByUserId(userId: string): Promise<SellerDocument | null> {
    return this.sellerModel.findOne({ user_id: new Types.ObjectId(userId) }).exec();
  }

  async findById(sellerId: string): Promise<SellerDocument | null> {
    return this.sellerModel.findById(sellerId).exec();
  }

  /**
   * Resolve the franchise hierarchy a seller's store sits under.
   * Returns `null` when the seller hasn't been linked to any franchise yet
   * (typically because they registered without a store_location).
   */
  async getMyFranchise(userId: string) {
    const seller = await this.findByUserId(userId);
    if (!seller) throw new NotFoundException('Seller profile not found - register as seller first');

    const sellerIdStr = (seller._id as unknown as { toString(): string }).toString();
    const hasGeo = !!seller.store_location?.coordinates;
    const lookup = await this.franchisesClient.lookupByStore(sellerIdStr);

    return {
      seller: {
        id: sellerIdStr,
        business_name: seller.business_name,
        store_location: seller.store_location ?? null,
      },
      has_store_location: hasGeo,
      // `lookup` is null when ehb-franchises is unreachable OR the store has
      // not been linked yet. The frontend distinguishes these via has_store_location.
      hierarchy: lookup,
    };
  }

  async update(userId: string, dto: UpdateSellerDto): Promise<SellerDocument> {
    const seller = await this.findByUserId(userId);
    if (!seller) throw new NotFoundException('Seller profile not found');

    Object.assign(seller, dto);
    return seller.save();
  }

  /**
   * Manually submit the seller's store profile to PSS for SQ verification.
   * Can only be triggered when sq_status is 'not_submitted' or 'rejected'.
   * Throws BadRequestException if a submission is already in-flight or approved.
   */
  async manualSubmitToPss(userId: string): Promise<{ sq_status: string; sq_request_id: string | null }> {
    const seller = await this.findByUserId(userId);
    if (!seller) throw new NotFoundException('Seller profile not found');

    const blockedStatuses = ['pending', 'pending_franchise', 'pending_edr', 'approved'];
    if (blockedStatuses.includes(seller.sq_status)) {
      throw new BadRequestException(
        `Cannot submit — current status is "${seller.sq_status}". ` +
        'Resubmission is only allowed when status is "not_submitted" or "rejected".',
      );
    }

    const entityData = {
      business_name: seller.business_name,
      business_category: seller.business_category,
      business_type: seller.business_type,
    };

    const result = await this.pssClient.submitForSQ(
      seller._id.toString(),
      userId,
      'seller',
      entityData,
    );

    const updated = await this.sellerModel.findByIdAndUpdate(
      seller._id,
      {
        sq_status: result.success ? 'pending' : 'not_submitted',
        sq_request_id: result.sq_request_id ?? null,
      },
      { new: true },
    ).exec();

    return {
      sq_status: updated?.sq_status ?? 'not_submitted',
      sq_request_id: updated?.sq_request_id ?? null,
    };
  }

  /**
   * Internal helper used by other services (e.g. webhooks) to update PSS status.
   */
  async submitToPss(
    sellerId: string,
    userId: string,
    entityData: Record<string, unknown>,
  ): Promise<void> {
    const result = await this.pssClient.submitForSQ(sellerId, userId, 'seller', entityData);
    await this.sellerModel.findByIdAndUpdate(sellerId, {
      sq_status: result.success ? 'pending' : 'not_submitted',
      sq_request_id: result.sq_request_id ?? null,
    }).exec();
  }

  async getStats(userId: string): Promise<{
    sq_status: string;
    sq_level: number | null;
    sq_badge_label: string | null;
    is_active: boolean;
  }> {
    const seller = await this.findByUserId(userId);
    if (!seller) throw new NotFoundException('Seller profile not found');
    return {
      sq_status: seller.sq_status,
      sq_level: seller.sq_level,
      sq_badge_label: seller.sq_badge_label,
      is_active: seller.is_active,
    };
  }

  toPublic(seller: SellerDocument) {
    return {
      id: seller._id.toString(),
      user_id: seller.user_id.toString(),
      business_name: seller.business_name,
      business_type: seller.business_type,
      business_category: seller.business_category,
      store_description: seller.store_description,
      store_logo_url: seller.store_logo_url,
      bank_info: seller.bank_info,
      document_urls: seller.document_urls,
      sq_status: seller.sq_status,
      sq_level: seller.sq_level,
      sq_badge_label: seller.sq_badge_label,
      is_active: seller.is_active,
      jps_profile_id: seller.jps_profile_id,
      jps_profile_linked_at: seller.jps_profile_linked_at,
    };
  }

  // ── JPS profile linkage ────────────────────────────────────────────────────

  /**
   * Returns the JPS profiles owned by the calling user that are eligible to be
   * attached to this GoSellr seller account (platform=gosellr, role=seller).
   * Marks each as already_linked when another seller (or this seller) has it.
   */
  async listEligibleJpsProfiles(userId: string, email: string) {
    const profiles = await this.jpsClient.listEligibleByEmail(email);

    // Find which of these profiles are already linked anywhere in our DB.
    const ids = profiles.map((p) => p._id);
    const linked = await this.sellerModel
      .find({ jps_profile_id: { $in: ids } })
      .select('jps_profile_id user_id')
      .lean()
      .exec();
    const linkedMap = new Map(
      linked.map((l) => [l.jps_profile_id ?? '', l.user_id.toString()]),
    );

    return profiles.map((p) => ({
      id: p._id,
      platform: p.platform,
      role: p.role,
      display_name: p.display_name,
      bio: p.bio,
      status: p.status,
      sq_level: p.sq_level,
      already_linked: linkedMap.has(p._id),
      linked_to_me: linkedMap.get(p._id) === userId,
    }));
  }

  /**
   * Returns the JPS profile currently linked to the seller's account, fully
   * hydrated from JPS (so badge / status reflect live JPS state).
   * Returns null when no profile is linked.
   */
  async getLinkedJpsProfile(userId: string, email: string) {
    const seller = await this.findByUserId(userId);
    if (!seller) throw new NotFoundException('Seller profile not found');
    if (!seller.jps_profile_id) return null;
    return this.jpsClient.getProfileForEmail(seller.jps_profile_id, email);
  }

  /**
   * Attach an existing JPS profile to this seller. Validates that:
   *   - the profile actually belongs to the calling user (JPS will 404 if not)
   *   - platform=gosellr, role=seller
   *   - no other seller has already claimed this profile (unique index)
   *
   * Any JPS status (draft / submitted / approved) is acceptable — buyers
   * will see a "Pending verification" pill until JPS marks it approved.
   */
  async attachJpsProfile(userId: string, email: string, profileId: string) {
    const seller = await this.findByUserId(userId);
    if (!seller) throw new NotFoundException('Seller profile not found');

    const jpsProfile = await this.jpsClient.getProfileForEmail(profileId, email);
    if (!jpsProfile) {
      throw new NotFoundException(
        'JPS profile not found, deleted, or does not belong to you',
      );
    }
    if (jpsProfile.platform !== 'gosellr') {
      throw new BadRequestException(
        `Profile must be for platform "gosellr" (got "${jpsProfile.platform}")`,
      );
    }
    if (jpsProfile.role !== 'seller') {
      throw new BadRequestException(
        `Profile must have role "seller" (got "${jpsProfile.role}")`,
      );
    }

    // Re-attaching the same profile is a no-op.
    if (seller.jps_profile_id === profileId) {
      return this.toPublic(seller);
    }

    seller.jps_profile_id = profileId;
    seller.jps_profile_linked_at = new Date();

    try {
      await seller.save();
    } catch (err: unknown) {
      const mongoErr = err as { code?: number };
      if (mongoErr.code === 11000) {
        throw new ConflictException(
          'This JPS profile is already linked to another GoSellr account',
        );
      }
      throw err;
    }

    // Ensure buyers see fresh data on the next product render.
    this.jpsClient.invalidateCache(profileId);
    this.logger.log(`Seller ${seller._id} linked to JPS profile ${profileId}`);
    return this.toPublic(seller);
  }

  /**
   * Used by the JPS deep-link return flow:
   * after the user creates a brand-new profile in JPS, JPS redirects them
   * back to GoSellr with no specific profile id — we then look up the
   * user's most recent unlinked gosellr+seller profile and attach it.
   *
   * If multiple eligible profiles exist, returns the newest one.
   */
  async autoAttachLatestJpsProfile(userId: string, email: string) {
    const eligible = await this.jpsClient.listEligibleByEmail(email);
    if (eligible.length === 0) {
      throw new NotFoundException(
        'No eligible JPS profile found. Create a profile in JPS first.',
      );
    }
    // Already-linked profiles
    const linkedDocs = await this.sellerModel
      .find({ jps_profile_id: { $in: eligible.map((p) => p._id) } })
      .select('jps_profile_id user_id')
      .lean()
      .exec();
    const claimedByOthers = new Set(
      linkedDocs
        .filter((l) => l.user_id.toString() !== userId)
        .map((l) => l.jps_profile_id),
    );

    const unclaimed = eligible.filter((p) => !claimedByOthers.has(p._id));
    if (unclaimed.length === 0) {
      throw new ConflictException(
        'All your eligible JPS profiles are already linked to other GoSellr accounts',
      );
    }

    // Pick newest by created_at desc; JPS returns this order already.
    return this.attachJpsProfile(userId, email, unclaimed[0]._id);
  }

  /**
   * Detach the JPS profile from this seller. Disallowed when the seller
   * has any products — products carry implicit owner identity through this
   * link, and unlinking would orphan the buyer's "Owner" sub-section.
   */
  async unlinkJpsProfile(userId: string) {
    const seller = await this.findByUserId(userId);
    if (!seller) throw new NotFoundException('Seller profile not found');
    if (!seller.jps_profile_id) {
      return this.toPublic(seller);
    }

    const productCount = await this.productModel
      .countDocuments({ seller_id: seller.user_id })
      .exec();
    if (productCount > 0) {
      throw new ConflictException(
        `Cannot unlink — you have ${productCount} active product(s). ` +
        'Delete or migrate them first, or attach a different JPS profile.',
      );
    }

    const oldId = seller.jps_profile_id;
    seller.jps_profile_id = null;
    seller.jps_profile_linked_at = null;
    await seller.save();
    this.jpsClient.invalidateCache(oldId);
    this.logger.log(`Seller ${seller._id} unlinked from JPS profile ${oldId}`);
    return this.toPublic(seller);
  }

  /**
   * Hard guard for the product upload flow: throws if no JPS profile is linked.
   * Called by ProductsService.createProduct().
   */
  async assertHasJpsProfile(userId: string): Promise<SellerDocument> {
    const seller = await this.findByUserId(userId);
    if (!seller) throw new NotFoundException('Seller profile not found');
    if (!seller.jps_profile_id) {
      // Use a structured 409 so the frontend can route the user to /jps-profile.
      throw new ConflictException({
        error: 'JPS_PROFILE_REQUIRED',
        message:
          'You must link a JPS profile before uploading products. ' +
          'Create one at JPS or attach an existing seller profile.',
        next: '/dashboard/jps-profile',
      });
    }
    return seller;
  }
}
