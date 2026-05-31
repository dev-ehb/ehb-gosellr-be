import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrdersService } from './orders.service';
import { UserDocument } from '../users/user.schema';
import { OrderStatus } from './order.schema';

class OrderItemDto {
  @ApiProperty()
  @IsString()
  product_id: string;

  @ApiProperty()
  @IsString()
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

  @ApiProperty()
  @IsNumber()
  @Min(0)
  subtotal: number;
}

class DeliveryAddressDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  address_line: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  area: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  lng?: number;
}

class CreateOrderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  seller_id: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ type: DeliveryAddressDto })
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  delivery_address: DeliveryAddressDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  delivery_fee?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  buyer_notes?: string;
}

class UpdateStatusDto {
  @ApiProperty({ enum: ['pending', 'confirmed', 'ready_for_delivery', 'picked', 'out_for_delivery', 'delivered', 'cancelled'] })
  @IsEnum(['pending', 'confirmed', 'ready_for_delivery', 'picked', 'out_for_delivery', 'delivered', 'cancelled'])
  status: OrderStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}

interface AuthRequest extends Request {
  user: UserDocument;
}

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Place a new order (buyer only)' })
  @ApiResponse({ status: 201, description: 'Order placed' })
  async createOrder(@Request() req: AuthRequest, @Body() dto: CreateOrderDto) {
    const buyerId = (req.user._id as unknown as { toString(): string }).toString();
    const order = await this.ordersService.create({ buyer_id: buyerId, ...dto });
    return this.ordersService.toPublic(order);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get orders for current user (role-based)' })
  async getMyOrders(@Request() req: AuthRequest) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    let orders;
    if (req.user.role === 'seller') {
      orders = await this.ordersService.findBySeller(userId);
    } else if (req.user.role === 'rider') {
      orders = await this.ordersService.findByRider(userId);
    } else {
      orders = await this.ordersService.findByBuyer(userId);
    }
    return orders.map((o) => this.ordersService.toPublic(o));
  }

  // ── /orders/available has been removed. Riders no longer pull from a shared
  //    pool — they only act on delivery requests addressed to them.
  //    See: GET /delivery-requests/pending

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  async getOrder(@Request() req: AuthRequest, @Param('id') id: string) {
    const order = await this.ordersService.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    return this.ordersService.toPublic(order);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update order status' })
  async updateStatus(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    const order = await this.ordersService.updateStatus(id, userId, req.user.role, dto.status, dto.note);
    return this.ordersService.toPublic(order);
  }

  // ── /assign-rider has been removed in favour of the request/accept flow.
  //    Riders can no longer self-assign; sellers send a delivery-request and
  //    the order's rider_id is set only when the rider accepts.
  //    See: POST /orders/:orderId/delivery-requests
  //         POST /delivery-requests/:id/accept

  @Get(':id/available-riders')
  @ApiOperation({
    summary: 'List riders eligible to deliver this order (seller only)',
    description:
      'Pulls SQ-approved riders from JPS (platform=gosellr, role=rider) and ' +
      'enriches each one with the local availability state (online/offline/' +
      'on_delivery) joined by email. Hides riders that have no JPS approval. ' +
      'Sorted online-first, then by SQ level.',
  })
  async availableRiders(@Request() req: AuthRequest, @Param('id') id: string) {
    if (req.user.role !== 'seller') {
      throw new ForbiddenException('Only sellers can list assignable riders');
    }
    const order = await this.ordersService.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    const sellerId = (req.user._id as unknown as { toString(): string }).toString();
    if (order.seller_id.toString() !== sellerId) {
      throw new ForbiddenException('Not your order');
    }
    return this.ordersService.listAvailableRidersForSeller();
  }
}
