import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, UserRole } from './user.schema';
import { hashPassword } from '../../../../../libs/gosellr-utils/src';

export interface CreateUserDto {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  phone?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findByEhbUserId(ehbUserId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ ehb_user_id: ehbUserId }).exec();
  }

  /**
   * Batch fetch by _id. Used by the Assign Rider modal to attach owner
   * info to rows already filtered down by jps_profile_id.
   */
  async findManyByIds(ids: string[]): Promise<UserDocument[]> {
    if (!ids?.length) return [];
    return this.userModel.find({ _id: { $in: ids } }).exec();
  }

  /**
   * Batch fetch by email. Used by the Assign Rider modal to resolve a list
   * of JPS profile owner emails to local gosellr User records in one query.
   */
  async findManyByEmails(emails: string[]): Promise<UserDocument[]> {
    if (!emails?.length) return [];
    const normalized = emails.map((e) => e.toLowerCase().trim());
    return this.userModel.find({ email: { $in: normalized } }).exec();
  }

  async createFromEhb(dto: {
    ehb_user_id: string;
    email: string;
    full_name: string;
    role: UserRole;
  }): Promise<UserDocument> {
    const byEhbId = await this.findByEhbUserId(dto.ehb_user_id);
    if (byEhbId) return byEhbId;

    const byEmail = await this.findByEmail(dto.email);
    if (byEmail) {
      byEmail.ehb_user_id = dto.ehb_user_id;
      return byEmail.save();
    }

    const user = new this.userModel({
      email: dto.email.toLowerCase().trim(),
      password: '',
      full_name: dto.full_name,
      role: dto.role,
      ehb_user_id: dto.ehb_user_id,
      is_email_verified: true,
    });

    try {
      return await user.save();
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 11000) {
        const recovered =
          (await this.findByEhbUserId(dto.ehb_user_id)) ??
          (await this.findByEmail(dto.email));
        if (recovered) return recovered;
      }
      throw err;
    }
  }

  async incrementTokenVersion(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { $inc: { token_version: 1 } }).exec();
  }

  async createUser(dto: CreateUserDto): Promise<UserDocument> {
    const existing = await this.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');
    const hashed = await hashPassword(dto.password);
    const user = new this.userModel({
      email: dto.email.toLowerCase().trim(),
      password: hashed,
      full_name: dto.full_name,
      role: dto.role,
      phone: dto.phone ?? null,
      is_email_verified: false,
    });
    return user.save();
  }

  async updatePassword(userId: string, newHashedPassword: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { password: newHashedPassword }).exec();
  }

  async updateRole(userId: string, role: UserRole): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { role }).exec();
  }

  async saveOtp(userId: string, otpCode: string, expiresAt: Date): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      otp_code: otpCode,
      otp_expires_at: expiresAt,
    }).exec();
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      otp_code: null,
      otp_expires_at: null,
      is_email_verified: true,
    }).exec();
  }

  toPublic(user: UserDocument) {
    return {
      id: (user._id as unknown as { toString(): string }).toString(),
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      phone: user.phone ?? null,
      is_email_verified: user.is_email_verified,
      has_password: !!user.password,
    };
  }
}
