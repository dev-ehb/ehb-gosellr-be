import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsEnum,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RiderService } from './rider.service';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/user.schema';
import { VehicleType, RiderAvailability } from './rider.schema';

class CreateRiderProfileDto {
  @ApiProperty({ example: '35202-1234567-1' })
  @IsString()
  @IsNotEmpty()
  cnic: string;

  @ApiProperty({ enum: ['bike', 'motorcycle', 'car', 'van', 'truck'] })
  @IsEnum(['bike', 'motorcycle', 'car', 'van', 'truck'])
  vehicle_type: VehicleType;

  @ApiProperty({ example: 'ABC-123' })
  @IsString()
  @IsNotEmpty()
  license_plate: string;

  @ApiProperty({ example: 'Lahore - Gulberg' })
  @IsString()
  @IsNotEmpty()
  availability_zone: string;
}

class UpdateRiderProfileDto {
  @ApiProperty({ enum: ['bike', 'motorcycle', 'car', 'van', 'truck'], required: false })
  @IsOptional()
  @IsEnum(['bike', 'motorcycle', 'car', 'van', 'truck'])
  vehicle_type?: VehicleType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  license_plate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  availability_zone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cnic_front_url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cnic_back_url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vehicle_photo_url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  driving_license_url?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  document_urls?: string[];
}

class SetAvailabilityDto {
  @ApiProperty({ enum: ['online', 'offline', 'on_delivery'] })
  @IsEnum(['online', 'offline', 'on_delivery'])
  availability: RiderAvailability;
}

class AttachJpsProfileDto {
  @ApiProperty({ example: '672a5f8b1c1f4d2c3a8b9d01' })
  @IsString()
  @IsNotEmpty()
  jps_profile_id: string;
}

interface AuthRequest extends Request {
  user: UserDocument;
}

@ApiTags('Rider')
@Controller('rider')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RiderController {
  constructor(
    private readonly riderService: RiderService,
    private readonly usersService: UsersService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create rider profile (role must be rider)' })
  @ApiResponse({ status: 201, description: 'Rider profile created; PSS submission triggered' })
  @ApiResponse({ status: 403, description: 'Account role is not rider' })
  @ApiResponse({ status: 409, description: 'Rider profile already exists' })
  async register(@Request() req: AuthRequest, @Body() dto: CreateRiderProfileDto) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    // Upgrade user role to rider if not already
    if (req.user.role !== 'rider') {
      await this.usersService.updateRole(userId, 'rider');
    }
    const rider = await this.riderService.create({ user_id: userId, ...dto });
    return this.riderService.toPublic(rider);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current rider profile' })
  @ApiResponse({ status: 200, description: 'Rider profile returned' })
  async getProfile(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const rider = await this.riderService.findByUserId(userId);
    if (!rider) return null;
    return this.riderService.toPublic(rider);
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update rider profile (docs, vehicle info)' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  async updateProfile(@Request() req: AuthRequest, @Body() dto: UpdateRiderProfileDto) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const rider = await this.riderService.update(userId, dto);
    return this.riderService.toPublic(rider);
  }

  @Patch('availability')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set rider availability (online / offline / on_delivery)' })
  @ApiResponse({ status: 200, description: 'Availability updated' })
  async setAvailability(@Request() req: AuthRequest, @Body() dto: SetAvailabilityDto) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    return this.riderService.setAvailability(userId, dto.availability);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get rider PSS/SQ stats and availability' })
  @ApiResponse({ status: 200, description: 'Stats returned' })
  async getStats(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    return this.riderService.getStats(userId);
  }

  // ── JPS profile linkage ────────────────────────────────────────────────────
  // Mirror of the seller routes at /seller/jps-profile/*. Required step before
  // sellers can see this rider in the Assign Rider modal.

  @Get('jps-profile/eligible')
  @ApiOperation({ summary: 'List my JPS profiles eligible for GoSellr rider linkage' })
  @ApiResponse({ status: 200, description: 'List returned' })
  async listEligibleJpsProfiles(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const email = (req.user.email ?? '').toLowerCase();
    return this.riderService.listEligibleJpsProfiles(userId, email);
  }

  @Get('jps-profile')
  @ApiOperation({ summary: 'Get the JPS profile currently linked to this rider account' })
  @ApiResponse({ status: 200, description: 'Linked profile or null' })
  async getLinkedJpsProfile(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const email = (req.user.email ?? '').toLowerCase();
    return this.riderService.getLinkedJpsProfile(userId, email);
  }

  @Post('jps-profile/attach')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Attach an existing JPS profile (must be platform=gosellr role=rider, owned by you)' })
  @ApiResponse({ status: 200, description: 'Attached' })
  @ApiResponse({ status: 400, description: 'Profile is wrong platform/role' })
  @ApiResponse({ status: 404, description: 'JPS profile not found or not yours' })
  @ApiResponse({ status: 409, description: 'Profile already linked to another GoSellr rider' })
  async attachJpsProfile(
    @Request() req: AuthRequest,
    @Body() dto: AttachJpsProfileDto,
  ) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const email = (req.user.email ?? '').toLowerCase();
    return this.riderService.attachJpsProfile(userId, email, dto.jps_profile_id);
  }

  @Post('jps-profile/return')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deep-link return from JPS — auto-attaches the rider\'s newest unlinked gosellr+rider profile',
  })
  @ApiResponse({ status: 200, description: 'Newly created JPS profile attached' })
  @ApiResponse({ status: 404, description: 'No eligible profile found in JPS' })
  async jpsReturnAutoAttach(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const email = (req.user.email ?? '').toLowerCase();
    return this.riderService.autoAttachLatestJpsProfile(userId, email);
  }

  @Delete('jps-profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlink the current JPS profile (blocked while on an active delivery)' })
  @ApiResponse({ status: 200, description: 'Unlinked' })
  @ApiResponse({ status: 409, description: 'Cannot unlink during active delivery' })
  async unlinkJpsProfile(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    return this.riderService.unlinkJpsProfile(userId);
  }
}
