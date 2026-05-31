import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument, OrderStatus } from './order.schema';
import { OrdersGateway } from './orders.gateway';
import { CartService } from '../cart/cart.service';
import { JpsClientService } from '../jps-client/jps-client.service';
import { UsersService } from '../users/users.service';
import { RiderService } from '../rider/rider.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { NotificationType } from '../notifications/notification.schema';

export interface CreateOrderDto {
  buyer_id: string;
  seller_id: string;
  items: Array<{
    product_id: string;
    product_name: string;
    product_image_url?: string;
    unit_price: number;
    quantity: number;
    subtotal: number;
  }>;
  delivery_address: {
    address_line: string;
    city: string;
    area: string;
    lat?: number;
    lng?: number;
  };
  delivery_fee?: number;
  buyer_notes?: string;
}

// Valid status transitions — only these moves are allowed
const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending:             ['confirmed', 'cancelled'],
  confirmed:           ['ready_for_delivery', 'cancelled'],
  ready_for_delivery:  ['picked'],
  picked:              ['out_for_delivery'],
  out_for_delivery:    ['delivered'],
  delivered:           [],
  cancelled:           [],
};

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly ordersGateway: OrdersGateway,
    private readonly cartService: CartService,
    private readonly jpsClient: JpsClientService,
    private readonly usersService: UsersService,
    private readonly riderService: RiderService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Fire-and-forget helper: persist a notification AND push it over the WS.
   * Never throws — a failure to notify must not break the parent flow
   * (order placement, status update, etc.).
   */
  private notify(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    link: string | null,
    metadata: Record<string, unknown> = {},
  ): void {
    void this.notifications
      .createSafe({ user_id: userId, type, title, message, link, metadata })
      .then((doc) => {
        if (doc) {
          this.ordersGateway.emitNotificationToUser(
            userId,
            this.notifications.toPublic(doc),
          );
        }
      })
      .catch(() => undefined);
  }

  /**
   * Returns the rider roster the seller's Assign Rider modal renders.
   *
   * Source of truth:
   *   - JPS  →  who is SQ-approved on the gosellr platform (display, badge)
   *   - local Rider table  →  who is online right now (presence, zone)
   *
   * Join key is the rider's email (same EHB identity on both sides). Any
   * JPS profile whose owning email has no matching gosellr User is hidden
   * (they have no account here to receive the assignment). Any gosellr rider
   * with no JPS approval is also hidden — the user explicitly asked for that.
   *
   * Sorted: online first, then by SQ level desc.
   */
  async listAvailableRidersForSeller(): Promise<Array<{
    jps_profile_id: string;
    rider_user_id: string;
    display_name: string;
    bio: string;
    sq_level: number | null;
    sq_badge_label: string | null;
    is_verified: boolean;
    availability: 'online' | 'offline' | 'on_delivery';
    availability_zone: string | null;
    vehicle_type: string | null;
  }>> {
    const roster = await this.jpsClient.listRoster({
      platform: 'gosellr',
      role: 'rider',
      status: 'approved',
    });
    if (roster.length === 0) return [];

    // ── Join strategy ────────────────────────────────────────────────────
    // The rider must have BOTH (a) a SQ-approved JPS profile AND (b) clicked
    // "Connect" on their gosellr dashboard so that their gosellr Rider row
    // carries the JPS profile id.
    //
    // We bind on jps_profile_id (strong link) rather than email (weak link)
    // because a person can have a JPS profile they haven't yet attached to
    // their delivery account, and email matching would surface those riders
    // even though they haven't accepted the gosellr terms.

    const jpsIds = roster
      .map((j) => ((j as unknown as { _id?: string; id?: string })._id
        ?? (j as unknown as { _id?: string; id?: string }).id) as string | undefined)
      .filter((id): id is string => !!id);

    const linkedRiders = await this.riderService.findManyByJpsProfileIds(jpsIds);
    if (linkedRiders.length === 0) return [];

    const riderByJpsId = new Map(
      linkedRiders
        .filter((r) => r.jps_profile_id)
        .map((r) => [r.jps_profile_id as string, r]),
    );

    // Also need the User row per rider (for display_name fallback + email).
    const userIds = linkedRiders.map((r) => r.user_id.toString());
    const users = await this.usersService.findManyByIds(userIds);
    const userById = new Map(
      users.map((u) => [(u._id as unknown as { toString(): string }).toString(), u]),
    );

    const out: Array<{
      jps_profile_id: string;
      rider_user_id: string;
      display_name: string;
      bio: string;
      sq_level: number | null;
      sq_badge_label: string | null;
      is_verified: boolean;
      availability: 'online' | 'offline' | 'on_delivery';
      availability_zone: string | null;
      vehicle_type: string | null;
    }> = [];

    for (const j of roster) {
      const jpsId = ((j as unknown as { _id?: string; id?: string })._id
        ?? (j as unknown as { _id?: string; id?: string }).id) as string | undefined;
      if (!jpsId) continue;
      const localRider = riderByJpsId.get(jpsId);
      if (!localRider) continue; // Not connected on gosellr — hide.
      const user = userById.get(localRider.user_id.toString());
      if (!user || user.role !== 'rider') continue;

      out.push({
        jps_profile_id: jpsId,
        rider_user_id: localRider.user_id.toString(),
        display_name: j.display_name,
        bio: j.bio ?? '',
        sq_level: j.sq_level ?? null,
        sq_badge_label:
          (j as unknown as { sq_badge_label?: string | null }).sq_badge_label ?? null,
        is_verified: j.status === 'approved' && j.sq_level !== null,
        availability: localRider.availability as
          | 'online' | 'offline' | 'on_delivery',
        availability_zone: localRider.availability_zone ?? null,
        vehicle_type: localRider.vehicle_type ?? null,
      });
    }

    // Sort: online first, then on_delivery, then offline. Within each
    // bucket, higher SQ level first.
    const bucketRank = { online: 0, on_delivery: 1, offline: 2 } as const;
    out.sort((a, b) => {
      const ba = bucketRank[a.availability] - bucketRank[b.availability];
      if (ba !== 0) return ba;
      return (b.sq_level ?? 0) - (a.sq_level ?? 0);
    });
    return out;
  }

  async create(dto: CreateOrderDto): Promise<OrderDocument> {
    const subtotal = dto.items.reduce((s, i) => s + i.subtotal, 0);
    const deliveryFee = dto.delivery_fee ?? 0;
    const total = subtotal + deliveryFee;

    const order = new this.orderModel({
      buyer_id: new Types.ObjectId(dto.buyer_id),
      seller_id: new Types.ObjectId(dto.seller_id),
      items: dto.items.map((i) => ({
        product_id: new Types.ObjectId(i.product_id),
        product_name: i.product_name,
        product_image_url: i.product_image_url ?? null,
        unit_price: i.unit_price,
        quantity: i.quantity,
        subtotal: i.subtotal,
      })),
      subtotal,
      delivery_fee: deliveryFee,
      total,
      status: 'pending' as OrderStatus,
      status_history: [{ status: 'pending', timestamp: new Date(), note: 'Order placed' }],
      delivery_address: {
        address_line: dto.delivery_address.address_line,
        city: dto.delivery_address.city,
        area: dto.delivery_address.area,
        lat: dto.delivery_address.lat ?? null,
        lng: dto.delivery_address.lng ?? null,
      },
      buyer_notes: dto.buyer_notes ?? null,
    });

    const saved = await order.save();
    // Clear buyer cart after successful order
    void this.cartService.clearCart(dto.buyer_id).catch(() => undefined);
    // Push real-time update
    this.emitUpdate(saved);

    // Inform both parties via the notification inbox.
    const shortId = saved._id.toString().slice(-8);
    this.notify(
      dto.buyer_id,
      'order:created',
      'Order placed',
      `Your order #${shortId} (PKR ${total.toLocaleString()}) is awaiting seller confirmation.`,
      `/orders/${saved._id.toString()}`,
      { order_id: saved._id.toString(), total },
    );
    this.notify(
      dto.seller_id,
      'order:created',
      'New order received',
      `Order #${shortId} from a new buyer — review and confirm to start fulfilment.`,
      `/dashboard/orders`,
      { order_id: saved._id.toString(), total },
    );

    return saved;
  }

  async findById(orderId: string): Promise<OrderDocument | null> {
    return this.orderModel.findById(orderId).exec();
  }

  async findByBuyer(buyerId: string): Promise<OrderDocument[]> {
    return this.orderModel
      .find({ buyer_id: new Types.ObjectId(buyerId) })
      .sort({ created_at: -1 })
      .exec();
  }

  async findBySeller(sellerId: string): Promise<OrderDocument[]> {
    return this.orderModel
      .find({ seller_id: new Types.ObjectId(sellerId) })
      .sort({ created_at: -1 })
      .exec();
  }

  async findByRider(riderId: string): Promise<OrderDocument[]> {
    return this.orderModel
      .find({ rider_id: new Types.ObjectId(riderId) })
      .sort({ created_at: -1 })
      .exec();
  }

  async findAvailableForRiders(): Promise<OrderDocument[]> {
    return this.orderModel
      .find({ status: 'ready_for_delivery', rider_id: null })
      .sort({ created_at: 1 })
      .exec();
  }

  async updateStatus(
    orderId: string,
    requesterId: string,
    requesterRole: string,
    newStatus: OrderStatus,
    note?: string,
  ): Promise<OrderDocument> {
    const order = await this.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');

    // Role-based permission checks
    const buyerId = order.buyer_id.toString();
    const sellerId = order.seller_id.toString();
    const riderId = order.rider_id?.toString() ?? null;

    if (requesterRole === 'seller' && sellerId !== requesterId) {
      throw new ForbiddenException('Not your order');
    }
    if (requesterRole === 'rider' && riderId && riderId !== requesterId) {
      throw new ForbiddenException('Not your delivery');
    }
    if (requesterRole === 'buyer' && buyerId !== requesterId) {
      throw new ForbiddenException('Not your order');
    }

    // Only buyers can cancel, only after pending
    if (newStatus === 'cancelled' && requesterRole !== 'buyer' && requesterRole !== 'seller') {
      throw new ForbiddenException('Only the buyer or seller can cancel an order');
    }

    // Validate transition
    const allowed = STATUS_TRANSITIONS[order.status];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from "${order.status}" to "${newStatus}". Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    order.status = newStatus;
    order.status_history.push({ status: newStatus, timestamp: new Date(), note: note ?? null });
    const saved = await order.save();
    this.emitUpdate(saved);

    // Fan out notifications per new status.
    const shortId = saved._id.toString().slice(-8);
    const link = `/orders/${saved._id.toString()}`;
    switch (newStatus) {
      case 'confirmed':
        this.notify(buyerId, 'order:confirmed', 'Order confirmed',
          `Seller has accepted order #${shortId}. They'll mark it ready for pickup shortly.`, link);
        break;
      case 'ready_for_delivery':
        this.notify(buyerId, 'order:ready_for_delivery', 'Order packed',
          `Order #${shortId} is ready for pickup — the seller will assign a rider.`, link);
        break;
      case 'picked':
        this.notify(buyerId, 'order:picked', 'Order picked up',
          `Your rider has picked up order #${shortId}. Headed to you next.`, link);
        this.notify(sellerId, 'order:picked', 'Rider picked up',
          `Rider has picked up order #${shortId}.`, '/dashboard/orders');
        break;
      case 'out_for_delivery':
        this.notify(buyerId, 'order:out_for_delivery', 'Out for delivery',
          `Order #${shortId} is on the way. Get ready to receive it.`, link);
        break;
      case 'delivered':
        this.notify(buyerId, 'order:delivered', 'Delivered',
          `Order #${shortId} has been delivered. Hope you love it!`, link);
        this.notify(sellerId, 'order:delivered', 'Delivered',
          `Order #${shortId} marked delivered by the rider.`, '/dashboard/orders');
        if (riderId) {
          this.notify(riderId, 'order:delivered', 'Delivery complete',
            `Delivery fee credited for order #${shortId}.`, '/dashboard/rider/history');
        }
        break;
      case 'cancelled':
        this.notify(buyerId, 'order:cancelled', 'Order cancelled',
          `Order #${shortId} was cancelled.`, link);
        this.notify(sellerId, 'order:cancelled', 'Order cancelled',
          `Order #${shortId} was cancelled.`, '/dashboard/orders');
        if (riderId) {
          this.notify(riderId, 'order:cancelled', 'Order cancelled',
            `Order #${shortId} you were assigned to was cancelled.`, '/dashboard/rider');
        }
        break;
      default:
        break;
    }

    return saved;
  }

  /**
   * Internal assignment — only called by DeliveryRequestsService after a
   * rider accepts a pending request. There is intentionally NO public
   * controller route that maps to this anymore; riders cannot self-assign,
   * and sellers must go through the request/accept handshake.
   */
  async assignRiderInternal(
    orderId: string,
    riderId: string,
    note?: string,
  ): Promise<OrderDocument> {
    const order = await this.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'ready_for_delivery') {
      throw new BadRequestException('Order must be ready_for_delivery before assigning a rider');
    }
    if (order.rider_id) {
      throw new BadRequestException('Order already has a rider assigned');
    }
    order.rider_id = new Types.ObjectId(riderId);
    // Note the assignment in status_history for auditability without
    // changing the status enum value.
    order.status_history.push({
      status: order.status,
      timestamp: new Date(),
      note: note ?? 'Rider assigned',
    });
    const saved = await order.save();
    this.emitUpdate(saved);

    // Tell the buyer that someone is on the way (the seller already knows
    // because they triggered the request that led to acceptance).
    const shortId = saved._id.toString().slice(-8);
    this.notify(
      saved.buyer_id.toString(),
      'order:rider_assigned',
      'Rider assigned',
      `A rider has been assigned to order #${shortId}.`,
      `/orders/${saved._id.toString()}`,
      { order_id: saved._id.toString(), rider_id: riderId },
    );

    return saved;
  }

  private emitUpdate(order: OrderDocument) {
    this.ordersGateway.emitOrderUpdated({
      order_id: order._id.toString(),
      buyer_id: order.buyer_id.toString(),
      seller_id: order.seller_id.toString(),
      rider_id: order.rider_id?.toString() ?? null,
      status: order.status,
      status_history: order.status_history,
    });
  }

  toPublic(order: OrderDocument) {
    return {
      id: order._id.toString(),
      buyer_id: order.buyer_id.toString(),
      seller_id: order.seller_id.toString(),
      rider_id: order.rider_id?.toString() ?? null,
      items: order.items.map((i) => ({
        product_id: i.product_id.toString(),
        product_name: i.product_name,
        product_image_url: i.product_image_url,
        unit_price: i.unit_price,
        quantity: i.quantity,
        subtotal: i.subtotal,
      })),
      subtotal: order.subtotal,
      delivery_fee: order.delivery_fee,
      total: order.total,
      status: order.status,
      status_history: order.status_history,
      delivery_address: order.delivery_address,
      buyer_notes: order.buyer_notes,
    };
  }
}
