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
  IsNumber,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SellerService } from './seller.service';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/user.schema';

class BankInfoDto {
  @ApiProperty({ example: 'HBL' })
  @IsString()
  @IsNotEmpty()
  bank_name: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  account_title: string;

  @ApiProperty({ example: '01234567890' })
  @IsString()
  @IsNotEmpty()
  account_number: string;

  @ApiProperty({ example: 'PK00HABB0000000000000000' })
  @IsString()
  @IsNotEmpty()
  iban: string;
}

class CreateSellerProfileDto {
  @ApiProperty({ example: 'jhon Electronics' })
  @IsString()
  @IsNotEmpty()
  business_name: string;

  @ApiProperty({ example: 'Retail' })
  @IsString()
  @IsNotEmpty()
  business_type: string;

  @ApiProperty({ example: 'Electronics' })
  @IsString()
  @IsNotEmpty()
  business_category: string;

  @ApiProperty({ example: 'Quality electronics at great prices', required: false })
  @IsOptional()
  @IsString()
  store_description?: string;

  @ApiProperty({
    example: 31.5204,
    required: false,
    description:
      'Store latitude. When provided together with store_lng, GoSellr forwards the new seller to ehb-franchises for auto-creation.',
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  store_lat?: number;

  @ApiProperty({ example: 74.3587, required: false, description: 'Store longitude.' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  store_lng?: number;
}

class UpdateSellerProfileDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  business_name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  business_type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  business_category?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  store_description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  store_logo_url?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  document_urls?: string[];

  @ApiProperty({ type: BankInfoDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => BankInfoDto)
  bank_info?: BankInfoDto;
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

function emailFromUser(req: AuthRequest): string {
  return (req.user.email ?? '').toLowerCase();
}

@ApiTags('Seller')
@Controller('seller')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SellerController {
  constructor(
    private readonly sellerService: SellerService,
    private readonly usersService: UsersService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create seller profile' })
  @ApiResponse({ status: 201, description: 'Seller profile created. PSS verification must be submitted manually via POST /seller/pss-submit.' })
  @ApiResponse({ status: 403, description: 'Account role is not seller' })
  @ApiResponse({ status: 409, description: 'Seller profile already exists' })
  async register(@Request() req: AuthRequest, @Body() dto: CreateSellerProfileDto) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    if (req.user.role !== 'seller') {
      await this.usersService.updateRole(userId, 'seller');
    }
    const seller = await this.sellerService.create({ user_id: userId, ...dto });
    return this.sellerService.toPublic(seller);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current seller profile' })
  @ApiResponse({ status: 200, description: 'Seller profile returned' })
  @ApiResponse({ status: 404, description: 'Seller profile not found' })
  async getProfile(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const seller = await this.sellerService.findByUserId(userId);
    if (!seller) {
      return null;
    }
    return this.sellerService.toPublic(seller);
  }

  @Get('franchise')
  @ApiOperation({
    summary: 'Get the franchise hierarchy this seller belongs to (Sub + Corporate + Master)',
  })
  @ApiResponse({ status: 200, description: 'Hierarchy returned; `hierarchy` is null when not yet linked.' })
  @ApiResponse({ status: 404, description: 'Seller profile not found' })
  async getMyFranchise(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    return this.sellerService.getMyFranchise(userId);
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update seller profile (business info, docs, bank)' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  async updateProfile(@Request() req: AuthRequest, @Body() dto: UpdateSellerProfileDto) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const seller = await this.sellerService.update(userId, dto);
    return this.sellerService.toPublic(seller);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get seller PSS/SQ stats and status' })
  @ApiResponse({ status: 200, description: 'Stats returned' })
  async getStats(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    return this.sellerService.getStats(userId);
  }

  @Post('pss-submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually submit store for PSS/SQ verification' })
  @ApiResponse({ status: 200, description: 'Verification request submitted; sq_status set to pending' })
  @ApiResponse({ status: 400, description: 'Cannot resubmit — already pending, in review, or approved' })
  @ApiResponse({ status: 404, description: 'Seller profile not found' })
  async submitToPss(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    return this.sellerService.manualSubmitToPss(userId);
  }

  // ── JPS profile linkage ────────────────────────────────────────────────────

  @Get('jps-profile/eligible')
  @ApiOperation({ summary: 'List my JPS profiles eligible for GoSellr seller linkage' })
  @ApiResponse({ status: 200, description: 'List returned' })
  async listEligibleJpsProfiles(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const email = emailFromUser(req);
    return this.sellerService.listEligibleJpsProfiles(userId, email);
  }

  @Get('jps-profile')
  @ApiOperation({ summary: 'Get the JPS profile currently linked to this seller account' })
  @ApiResponse({ status: 200, description: 'Linked profile or null' })
  async getLinkedJpsProfile(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const email = emailFromUser(req);
    return this.sellerService.getLinkedJpsProfile(userId, email);
  }

  @Post('jps-profile/attach')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Attach an existing JPS profile (must be platform=gosellr role=seller, owned by you)' })
  @ApiResponse({ status: 200, description: 'Attached' })
  @ApiResponse({ status: 400, description: 'Profile is wrong platform/role' })
  @ApiResponse({ status: 404, description: 'JPS profile not found or not yours' })
  @ApiResponse({ status: 409, description: 'Profile already linked to another GoSellr seller' })
  async attachJpsProfile(@Request() req: AuthRequest, @Body() dto: AttachJpsProfileDto) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const email = emailFromUser(req);
    return this.sellerService.attachJpsProfile(userId, email, dto.jps_profile_id);
  }

  @Post('jps-profile/return')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deep-link return from JPS — auto-attaches the user\'s newest unlinked gosellr+seller profile',
    description:
      'Called by the GoSellr frontend after the user has come back from JPS\'s ' +
      '"Create new profile" flow. Looks at the calling user\'s eligible profiles ' +
      'and attaches the most recent unclaimed one.',
  })
  @ApiResponse({ status: 200, description: 'Newly created JPS profile attached' })
  @ApiResponse({ status: 404, description: 'No eligible profile found in JPS' })
  async jpsReturnAutoAttach(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const email = emailFromUser(req);
    return this.sellerService.autoAttachLatestJpsProfile(userId, email);
  }

  @Delete('jps-profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlink the current JPS profile (only allowed with zero products)' })
  @ApiResponse({ status: 200, description: 'Unlinked' })
  @ApiResponse({ status: 409, description: 'Cannot unlink while products exist' })
  async unlinkJpsProfile(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    return this.sellerService.unlinkJpsProfile(userId);
  }
}
