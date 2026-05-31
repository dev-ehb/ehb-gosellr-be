import {
  Controller, Get, Post, Delete, Param, Request, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WishlistService } from './wishlist.service';
import { UserDocument } from '../users/user.schema';

interface AuthReq extends Request {
  user: UserDocument;
}

@ApiTags('Wishlist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user\'s wishlist (full product details)' })
  list(@Request() req: AuthReq) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    return this.wishlistService.list(userId);
  }

  @Get('ids')
  @ApiOperation({ summary: 'Get just the product_ids in the wishlist (cheap lookup)' })
  listIds(@Request() req: AuthReq) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    return this.wishlistService.listIds(userId).then((ids) => ({ data: ids }));
  }

  @Post(':productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add a product to wishlist (idempotent)' })
  add(@Request() req: AuthReq, @Param('productId') productId: string) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    return this.wishlistService.add(userId, productId);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a product from wishlist' })
  remove(@Request() req: AuthReq, @Param('productId') productId: string) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    return this.wishlistService.remove(userId, productId);
  }
}
