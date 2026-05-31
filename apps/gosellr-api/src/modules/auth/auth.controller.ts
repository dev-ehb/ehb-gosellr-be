import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
  IsOptional,
  Length,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UserDocument } from '../users/user.schema';

class RegisterDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongPass123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  full_name: string;

  @ApiProperty({ enum: ['seller', 'buyer', 'rider'], example: 'buyer' })
  @IsEnum(['seller', 'buyer', 'rider'])
  role: 'seller' | 'buyer' | 'rider';

  @ApiProperty({ example: '+923001234567', required: false })
  @IsOptional()
  @IsString()
  phone?: string;
}

class SendOtpDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;
}

class VerifyOtpDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '482910', description: '6-digit OTP code' })
  @IsString()
  @Length(6, 6)
  otp: string;
}

class LoginDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongPass123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

class SwitchRoleDto {
  @ApiProperty({ enum: ['buyer', 'seller', 'rider'], example: 'buyer' })
  @IsEnum(['buyer', 'seller', 'rider'])
  role: 'buyer' | 'seller' | 'rider';
}

class EhbCallbackDto {
  @ApiProperty({ description: 'EHB JWT issued by EHB Main identity platform' })
  @IsString()
  @IsNotEmpty()
  ehb_token: string;
}

class ChangePasswordDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  current_password?: string;

  @ApiProperty({ example: 'NewSecure123', minLength: 6 })
  @IsString()
  @MinLength(6)
  new_password: string;
}

interface AuthenticatedRequest extends Request {
  user: UserDocument;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user (buyer, seller, or rider)' })
  @ApiResponse({ status: 201, description: 'User created; OTP sent to email' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send (or resend) OTP to registered email' })
  @ApiResponse({ status: 200, description: 'OTP sent' })
  @ApiResponse({ status: 404, description: 'No account found with that email' })
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto.email);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and activate account' })
  @ApiResponse({ status: 200, description: 'JWT returned; account activated' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.email, dto.otp);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email + password' })
  @ApiResponse({ status: 200, description: 'JWT returned' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or email not verified' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Current user returned' })
  getMe(@Request() req: AuthenticatedRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    return this.authService.getMe(userId);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change or set a local password' })
  @ApiResponse({ status: 200, description: 'Password updated' })
  changePassword(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    return this.authService.changePassword(userId, dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout — revoke all GoSellr sessions' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  logout(@Request() req: AuthenticatedRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    return this.authService.logout(userId);
  }

  @Post('ehb-callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'EHB OAuth callback — exchange EHB token for GoSellr JWT' })
  @ApiResponse({ status: 200, description: 'GoSellr JWT and user returned' })
  @ApiResponse({ status: 401, description: 'Invalid EHB token' })
  ehbCallback(@Body() dto: EhbCallbackDto) {
    if (!dto.ehb_token) throw new UnauthorizedException('Missing ehb_token');
    return this.authService.ehbCallback(dto.ehb_token);
  }

  @Post('switch-role')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Switch active role (buyer ↔ seller ↔ rider). Returns a fresh JWT.' })
  @ApiResponse({ status: 200, description: 'Role updated; new JWT returned' })
  @ApiResponse({ status: 404, description: 'User not found' })
  switchRole(@Request() req: AuthenticatedRequest, @Body() dto: SwitchRoleDto) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    return this.authService.switchRole(userId, dto.role);
  }
}
