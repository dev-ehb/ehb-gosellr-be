import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { UserDocument, UserRole } from '../users/user.schema';
import { comparePassword, hashPassword } from '../../../../../libs/gosellr-utils/src';
import { EhbClientService } from './ehb-client.service';
import { EmailService } from '../email/email.service';

export interface RegisterDto {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  phone?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly ehbClient: EhbClientService,
    private readonly emailService: EmailService,
  ) {}

  private signToken(user: UserDocument): string {
    return this.jwtService.sign({
      sub: (user._id as unknown as { toString(): string }).toString(),
      email: user.email,
      role: user.role,
      token_version: user.token_version ?? 0,
    });
  }

  private generateOtp(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  async register(dto: RegisterDto) {
    const user = await this.usersService.createUser(dto);

    const otp = this.generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.usersService.saveOtp(
      (user._id as unknown as { toString(): string }).toString(),
      otp,
      expiresAt,
    );
    void this.emailService.sendOtp(user.email, otp).catch(() => undefined);

    return {
      message: 'Registration successful. Check your email for the OTP verification code.',
      user: this.usersService.toPublic(user),
    };
  }

  async sendOtp(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new NotFoundException('No account found with that email');

    if (user.is_email_verified) {
      return { message: 'Email is already verified' };
    }

    const otp = this.generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.usersService.saveOtp(
      (user._id as unknown as { toString(): string }).toString(),
      otp,
      expiresAt,
    );
    await this.emailService.sendOtp(user.email, otp);
    return { message: 'OTP sent to your email address' };
  }

  async verifyOtp(
    email: string,
    otp: string,
  ): Promise<{ access_token: string; user: ReturnType<UsersService['toPublic']> }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new NotFoundException('No account found with that email');

    if (user.is_email_verified) {
      return { access_token: this.signToken(user), user: this.usersService.toPublic(user) };
    }

    if (!user.otp_code || !user.otp_expires_at) {
      throw new BadRequestException('No OTP pending. Call /auth/otp/send first.');
    }
    if (new Date() > user.otp_expires_at) {
      throw new BadRequestException('OTP has expired. Request a new one via /auth/otp/send.');
    }
    if (user.otp_code !== otp) {
      throw new BadRequestException('Invalid OTP code.');
    }

    const userId = (user._id as unknown as { toString(): string }).toString();
    await this.usersService.markEmailVerified(userId);

    const verified = await this.usersService.findById(userId);
    return {
      access_token: this.signToken(verified!),
      user: this.usersService.toPublic(verified!),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid email or password');

    if (!user.password) {
      throw new UnauthorizedException('This account uses EHB login. Please sign in via EHB.');
    }
    const valid = await comparePassword(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid email or password');

    if (!user.is_active) throw new UnauthorizedException('Account is inactive');

    if (!user.is_email_verified) {
      throw new UnauthorizedException('Email not verified. Check your inbox for the OTP.');
    }

    return { access_token: this.signToken(user), user: this.usersService.toPublic(user) };
  }

  async getMe(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return this.usersService.toPublic(user);
  }

  async changePassword(
    userId: string,
    dto: { current_password?: string; new_password: string },
  ): Promise<{ message: string }> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');

    if (user.password) {
      if (!dto.current_password) {
        throw new BadRequestException('current_password is required');
      }
      const valid = await comparePassword(dto.current_password, user.password);
      if (!valid) throw new UnauthorizedException('Current password is incorrect');
    }

    const hashed = await hashPassword(dto.new_password);
    await this.usersService.updatePassword(userId, hashed);
    return { message: 'Password updated successfully' };
  }

  async logout(userId: string): Promise<{ success: true; message: string }> {
    await this.usersService.incrementTokenVersion(userId);
    return { success: true, message: 'Logged out. All GoSellr sessions revoked.' };
  }

  async ehbCallback(ehbToken: string): Promise<{
    access_token: string;
    user: ReturnType<UsersService['toPublic']>;
  }> {
    const ehbUser = await this.ehbClient.verifyToken(ehbToken);

    const gosellrUser = await this.usersService.createFromEhb({
      ehb_user_id: ehbUser.ehb_user_id,
      email: ehbUser.email,
      full_name: ehbUser.full_name,
      role: 'buyer' as UserRole,
    });

    void this.ehbClient.linkPlatform(ehbToken);

    return {
      access_token: this.signToken(gosellrUser),
      user: this.usersService.toPublic(gosellrUser),
    };
  }

  /**
   * Switch the authenticated user's active role (buyer ↔ seller ↔ rider).
   * Updates role in the DB and re-signs a fresh JWT so subsequent API calls
   * carry the correct role claim.
   */
  async switchRole(
    userId: string,
    targetRole: 'buyer' | 'seller' | 'rider',
  ): Promise<{ access_token: string; user: ReturnType<UsersService['toPublic']> }> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    await this.usersService.updateRole(userId, targetRole as UserRole);
    user.role = targetRole as UserRole; // update in-memory so signToken picks it up

    return {
      access_token: this.signToken(user),
      user: this.usersService.toPublic(user),
    };
  }
}
