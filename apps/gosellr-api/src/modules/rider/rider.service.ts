import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Rider, RiderDocument, VehicleType } from './rider.schema';
import { PssClientService } from '../pss-client/pss-client.service';
import { JpsClientService } from '../jps-client/jps-client.service';

export interface CreateRiderDto {
  user_id: string;
  cnic: string;
  vehicle_type: VehicleType;
  license_plate: string;
  availability_zone: string;
}

export interface UpdateRiderDto {
  vehicle_type?: VehicleType;
  license_plate?: string;
  availability_zone?: string;
  cnic_front_url?: string;
  cnic_back_url?: string;
  vehicle_photo_url?: string;
  driving_license_url?: string;
  document_urls?: string[];
  availability?: 'online' | 'offline' | 'on_delivery';
}

@Injectable()
export class RiderService {
  private readonly logger = new Logger(RiderService.name);

  constructor(
    @InjectModel(Rider.name) private readonly riderModel: Model<RiderDocument>,
    private readonly pssClient: PssClientService,
    private readonly jpsClient: JpsClientService,
  ) {}

  /**
   * Batch fetch local rider profiles for a set of gosellr user_ids.
   * Used by the Assign Rider modal to attach presence/availability to
   * the JPS-verified rider roster.
   */
  async findManyByUserIds(userIds: string[]): Promise<RiderDocument[]> {
    if (!userIds?.length) return [];
    const objectIds = userIds.map((id) => new Types.ObjectId(id));
    return this.riderModel.find({ user_id: { $in: objectIds } }).exec();
  }

  /**
   * Batch fetch local rider profiles by their attached JPS profile ids.
   * Used by the Assign Rider modal to enforce the "must be Connected on
   * gosellr" gate — riders without a `jps_profile_id` value won't match.
   */
  async findManyByJpsProfileIds(jpsIds: string[]): Promise<RiderDocument[]> {
    if (!jpsIds?.length) return [];
    return this.riderModel.find({ jps_profile_id: { $in: jpsIds } }).exec();
  }

  async create(dto: CreateRiderDto): Promise<RiderDocument> {
    const existing = await this.riderModel.findOne({
      user_id: new Types.ObjectId(dto.user_id),
    }).exec();
    if (existing) throw new ConflictException('Rider profile already exists for this account');

    const rider = new this.riderModel({
      user_id: new Types.ObjectId(dto.user_id),
      cnic: dto.cnic,
      vehicle_type: dto.vehicle_type,
      license_plate: dto.license_plate,
      availability_zone: dto.availability_zone,
    });
    const saved = await rider.save();

    // Submit to PSS immediately (best-effort)
    void this.submitToPss(
      saved._id.toString(),
      dto.user_id,
      { cnic: dto.cnic, vehicle_type: dto.vehicle_type, availability_zone: dto.availability_zone },
    ).catch(() => undefined);

    return saved;
  }

  async findByUserId(userId: string): Promise<RiderDocument | null> {
    return this.riderModel.findOne({ user_id: new Types.ObjectId(userId) }).exec();
  }

  async findById(riderId: string): Promise<RiderDocument | null> {
    return this.riderModel.findById(riderId).exec();
  }

  async update(userId: string, dto: UpdateRiderDto): Promise<RiderDocument> {
    const rider = await this.findByUserId(userId);
    if (!rider) throw new NotFoundException('Rider profile not found');
    Object.assign(rider, dto);
    return rider.save();
  }

  async setAvailability(
    userId: string,
    availability: 'online' | 'offline' | 'on_delivery',
  ): Promise<{ availability: string }> {
    const rider = await this.findByUserId(userId);
    if (!rider) throw new NotFoundException('Rider profile not found');
    rider.availability = availability;
    await rider.save();
    return { availability };
  }

  async submitToPss(
    riderId: string,
    userId: string,
    entityData: Record<string, unknown>,
  ): Promise<void> {
    const result = await this.pssClient.submitForSQ(riderId, userId, 'rider', entityData);
    await this.riderModel.findByIdAndUpdate(riderId, {
      sq_status: result.success ? 'pending' : 'not_submitted',
      sq_request_id: result.sq_request_id ?? null,
    }).exec();
  }

  async getStats(userId: string) {
    const rider = await this.findByUserId(userId);
    if (!rider) throw new NotFoundException('Rider profile not found');
    return {
      sq_status: rider.sq_status,
      sq_level: rider.sq_level,
      sq_badge_label: rider.sq_badge_label,
      availability: rider.availability,
      is_active: rider.is_active,
    };
  }

  // ── JPS profile linkage ────────────────────────────────────────────────────
  // Mirrors the SellerService link methods. Riders must link a JPS profile
  // (platform=gosellr, role=rider) before sellers can send them delivery
  // requests — the Assign Rider modal filters out riders without a link.

  /**
   * Returns the JPS profiles owned by the calling user that are eligible
   * to be attached to this rider account (platform=gosellr, role=rider).
   * Marks each as already_linked when another rider has it.
   */
  async listEligibleJpsProfiles(userId: string, email: string) {
    const profiles = await this.jpsClient.listEligibleByEmail(email, 'rider');

    const ids = profiles.map((p) => p._id);
    const linked = await this.riderModel
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
   * Returns the JPS profile currently linked to the rider's account, fully
   * hydrated from JPS. Returns null when no profile is linked.
   */
  async getLinkedJpsProfile(userId: string, email: string) {
    const rider = await this.findByUserId(userId);
    if (!rider) throw new NotFoundException('Rider profile not found');
    if (!rider.jps_profile_id) return null;
    return this.jpsClient.getProfileForEmail(rider.jps_profile_id, email);
  }

  /**
   * Attach an existing JPS profile to this rider. Validates ownership via
   * JPS, platform=gosellr, role=rider. Any JPS status is acceptable — sellers
   * only see this rider in the Assign Rider modal once JPS marks it approved.
   */
  async attachJpsProfile(userId: string, email: string, profileId: string) {
    const rider = await this.findByUserId(userId);
    if (!rider) throw new NotFoundException('Rider profile not found');

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
    if (jpsProfile.role !== 'rider') {
      throw new BadRequestException(
        `Profile must have role "rider" (got "${jpsProfile.role}")`,
      );
    }

    // Re-attaching the same profile is a no-op.
    if (rider.jps_profile_id === profileId) {
      return this.toPublic(rider);
    }

    rider.jps_profile_id = profileId;
    rider.jps_profile_linked_at = new Date();

    try {
      await rider.save();
    } catch (err: unknown) {
      const mongoErr = err as { code?: number };
      if (mongoErr.code === 11000) {
        throw new ConflictException(
          'This JPS profile is already linked to another GoSellr rider',
        );
      }
      throw err;
    }

    this.jpsClient.invalidateCache(profileId);
    this.logger.log(`Rider ${rider._id} linked to JPS profile ${profileId}`);
    return this.toPublic(rider);
  }

  /**
   * Deep-link return flow: after the rider creates a brand-new profile in
   * JPS, JPS redirects back to GoSellr — we then look up the user's most
   * recent unlinked gosellr+rider JPS profile and attach it.
   */
  async autoAttachLatestJpsProfile(userId: string, email: string) {
    const eligible = await this.jpsClient.listEligibleByEmail(email, 'rider');
    if (eligible.length === 0) {
      throw new NotFoundException(
        'No eligible JPS profile found. Create a profile in JPS first.',
      );
    }
    const linkedDocs = await this.riderModel
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
        'All your eligible JPS profiles are already linked to other GoSellr rider accounts',
      );
    }

    return this.attachJpsProfile(userId, email, unclaimed[0]._id);
  }

  /**
   * Detach the JPS profile from this rider. Disallowed while the rider is
   * mid-delivery (availability === 'on_delivery') — there's an order
   * counting on this identity until it's marked delivered.
   */
  async unlinkJpsProfile(userId: string) {
    const rider = await this.findByUserId(userId);
    if (!rider) throw new NotFoundException('Rider profile not found');
    if (!rider.jps_profile_id) {
      return this.toPublic(rider);
    }
    if (rider.availability === 'on_delivery') {
      throw new ConflictException(
        'Cannot unlink while you have an active delivery. Finish or cancel it first.',
      );
    }

    const oldId = rider.jps_profile_id;
    rider.jps_profile_id = null;
    rider.jps_profile_linked_at = null;
    await rider.save();
    this.jpsClient.invalidateCache(oldId);
    this.logger.log(`Rider ${rider._id} unlinked from JPS profile ${oldId}`);
    return this.toPublic(rider);
  }

  toPublic(rider: RiderDocument) {
    return {
      id: rider._id.toString(),
      user_id: rider.user_id.toString(),
      cnic: rider.cnic,
      vehicle_type: rider.vehicle_type,
      license_plate: rider.license_plate,
      availability_zone: rider.availability_zone,
      availability: rider.availability,
      cnic_front_url: rider.cnic_front_url,
      cnic_back_url: rider.cnic_back_url,
      vehicle_photo_url: rider.vehicle_photo_url,
      driving_license_url: rider.driving_license_url,
      document_urls: rider.document_urls,
      sq_status: rider.sq_status,
      sq_level: rider.sq_level,
      sq_badge_label: rider.sq_badge_label,
      is_active: rider.is_active,
      jps_profile_id: rider.jps_profile_id ?? null,
      jps_profile_linked_at: rider.jps_profile_linked_at?.toISOString() ?? null,
    };
  }
}
