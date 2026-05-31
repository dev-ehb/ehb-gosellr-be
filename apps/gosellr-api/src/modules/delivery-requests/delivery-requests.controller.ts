import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeliveryRequestsService } from './delivery-requests.service';
import { OrdersService } from '../orders/orders.service';
import { JpsClientService } from '../jps-client/jps-client.service';
import { RiderService } from '../rider/rider.service';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/user.schema';

class CreateDeliveryRequestDto {
  @ApiProperty({ description: 'JPS profile id of the rider being asked' })
  @IsString()
  @IsNotEmpty()
  rider_jps_profile_id: string;

  @ApiProperty({ description: 'Local gosellr User _id of the rider (the join key)' })
  @IsString()
  @IsNotEmpty()
  rider_user_id: string;
}

class RejectDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

interface AuthRequest extends Request {
  user: UserDocument;
}

/**
 * Two controllers in one file:
 *   - /orders/:orderId/delivery-requests   — seller-scoped (create, get active, cancel)
 *   - /delivery-requests                   — rider-scoped (list pending, accept, reject)
 *
 * Split deliberately so the seller's route stays grouped with /orders/* and
 * the rider's inbox route doesn't need an orderId path param.
 */

@ApiTags('Delivery Requests (Seller)')
@Controller('orders/:orderId/delivery-requests')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrderDeliveryRequestsController {
  private readonly logger = new Logger(OrderDeliveryRequestsController.name);

  constructor(
    private readonly deliveryRequests: DeliveryRequestsService,
    private readonly ordersService: OrdersService,
    private readonly jpsClient: JpsClientService,
    private readonly riderService: RiderService,
    private readonly usersService: UsersService,
  ) {}

  // ── GET /orders/:orderId/available-riders is on OrdersController to keep
  //    the modal-loading endpoint colocated with the order. The two CREATE/
  //    cancel/active endpoints below operate on this order's request lifecycle.

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a delivery request to a rider (seller only)' })
  @ApiResponse({ status: 201, description: 'Request created, pending rider acceptance' })
  async create(
    @Request() req: AuthRequest,
    @Param('orderId') orderId: string,
    @Body() dto: CreateDeliveryRequestDto,
  ) {
    if (req.user.role !== 'seller') {
      throw new ForbiddenException('Only sellers can send delivery requests');
    }
    const sellerId = (req.user._id as unknown as { toString(): string }).toString();

    // Re-validate the rider is real, eligible, Connected on gosellr, and
    // approved on JPS. The frontend hands us both ids — we trust neither
    // blindly and re-check every link in the chain.
    const rider = await this.usersService.findById(dto.rider_user_id);
    if (!rider) throw new NotFoundException('Rider user not found');
    if (rider.role !== 'rider') throw new ForbiddenException('Target user is not a rider');

    // 1. Gosellr-side: the rider must have run the Connect flow.
    const localRider = await this.riderService.findByUserId(dto.rider_user_id);
    if (!localRider || localRider.jps_profile_id !== dto.rider_jps_profile_id) {
      throw new ForbiddenException(
        'Rider has not connected their JPS profile on GoSellr yet',
      );
    }

    // 2. JPS-side: the profile must currently be SQ-approved.
    const jpsRoster = await this.jpsClient.listRoster({
      platform: 'gosellr',
      role: 'rider',
      status: 'approved',
    });
    const jpsEntry = jpsRoster.find(
      (p) => (p as unknown as { _id?: string; id?: string })._id === dto.rider_jps_profile_id
        || (p as unknown as { _id?: string; id?: string }).id === dto.rider_jps_profile_id,
    );
    if (!jpsEntry || jpsEntry.owner_email !== rider.email) {
      throw new ForbiddenException(
        'Rider is not currently SQ-approved on JPS for the gosellr platform',
      );
    }

    const order = await this.ordersService.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');

    const doc = await this.deliveryRequests.create({
      orderId,
      sellerId,
      riderUserId: dto.rider_user_id,
      riderJpsProfileId: dto.rider_jps_profile_id,
      riderDisplayName: jpsEntry.display_name ?? rider.full_name,
      deliveryFee: order.delivery_fee ?? 0,
    });
    return this.deliveryRequests.toPublic(doc);
  }

  @Get('active')
  @ApiOperation({ summary: 'Most recent delivery request for this order, if any' })
  async getActive(@Request() req: AuthRequest, @Param('orderId') orderId: string) {
    const order = await this.ordersService.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    const userId = (req.user._id as unknown as { toString(): string }).toString();
    // Seller of the order or the assigned rider can read it.
    const isParty =
      order.seller_id.toString() === userId
      || order.rider_id?.toString() === userId;
    if (!isParty) throw new ForbiddenException('Not your order');

    const doc = await this.deliveryRequests.findActiveForOrder(orderId);
    return doc ? this.deliveryRequests.toPublic(doc) : null;
  }
}

@ApiTags('Delivery Requests (Rider)')
@Controller('delivery-requests')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RiderDeliveryRequestsController {
  constructor(private readonly deliveryRequests: DeliveryRequestsService) {}

  @Get('pending')
  @ApiOperation({ summary: 'Pending delivery requests addressed to me (rider)' })
  async listPending(@Request() req: AuthRequest) {
    if (req.user.role !== 'rider') {
      throw new ForbiddenException('Only riders have a pending-requests inbox');
    }
    const riderId = (req.user._id as unknown as { toString(): string }).toString();
    const docs = await this.deliveryRequests.listPendingForRider(riderId);
    return docs.map((d) => this.deliveryRequests.toPublic(d));
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a pending delivery request' })
  async accept(@Request() req: AuthRequest, @Param('id') id: string) {
    if (req.user.role !== 'rider') {
      throw new ForbiddenException('Only riders can respond to delivery requests');
    }
    const riderId = (req.user._id as unknown as { toString(): string }).toString();
    const doc = await this.deliveryRequests.accept(id, riderId);
    return this.deliveryRequests.toPublic(doc);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending delivery request' })
  async reject(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: RejectDto,
  ) {
    if (req.user.role !== 'rider') {
      throw new ForbiddenException('Only riders can respond to delivery requests');
    }
    const riderId = (req.user._id as unknown as { toString(): string }).toString();
    const doc = await this.deliveryRequests.reject(id, riderId, dto.reason);
    return this.deliveryRequests.toPublic(doc);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending delivery request (seller only)' })
  async cancel(@Request() req: AuthRequest, @Param('id') id: string) {
    if (req.user.role !== 'seller') {
      throw new ForbiddenException('Only sellers can cancel their delivery requests');
    }
    const sellerId = (req.user._id as unknown as { toString(): string }).toString();
    const doc = await this.deliveryRequests.cancel(id, sellerId);
    return this.deliveryRequests.toPublic(doc);
  }
}
