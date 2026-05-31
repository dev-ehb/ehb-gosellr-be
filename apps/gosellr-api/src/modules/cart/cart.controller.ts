import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CartService } from './cart.service';
import { UserDocument } from '../users/user.schema';

class AddToCartDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  product_id: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  product_name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  product_image_url?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unit_price: number;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity: number;
}

class UpdateQuantityDto {
  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity: number;
}

interface AuthRequest extends Request {
  user: UserDocument;
}

@ApiTags('Cart')
@Controller('cart')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user cart' })
  async getCart(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const cart = await this.cartService.getOrCreate(userId);
    return this.cartService.toPublic(cart);
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add item to cart (or increase quantity if already in cart)' })
  async addItem(@Request() req: AuthRequest, @Body() dto: AddToCartDto) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const cart = await this.cartService.addItem(userId, dto);
    return this.cartService.toPublic(cart);
  }

  @Patch('items/:productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update item quantity in cart' })
  async updateItem(
    @Request() req: AuthRequest,
    @Param('productId') productId: string,
    @Body() dto: UpdateQuantityDto,
  ) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const cart = await this.cartService.updateItemQuantity(userId, productId, dto.quantity);
    return this.cartService.toPublic(cart);
  }

  @Delete('items/:productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove item from cart' })
  async removeItem(@Request() req: AuthRequest, @Param('productId') productId: string) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const cart = await this.cartService.removeItem(userId, productId);
    return this.cartService.toPublic(cart);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear entire cart' })
  async clearCart(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    await this.cartService.clearCart(userId);
    return { message: 'Cart cleared' };
  }
}
