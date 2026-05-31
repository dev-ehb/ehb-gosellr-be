import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

/**
 * Real-time order updates gateway.
 *
 * Clients join rooms by order_id or user_id to receive targeted pushes.
 *
 * Events server -> client:
 *   order:updated   { order_id, status, status_history, updated_at }
 *
 * Events client -> server:
 *   join:order      { order_id }    — subscribe to a specific order's updates
 *   join:user       { user_id }     — subscribe to all orders for a user
 *   leave:order     { order_id }    — unsubscribe from order
 */
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/orders' })
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OrdersGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:order')
  handleJoinOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { order_id: string },
  ) {
    void client.join(`order:${data.order_id}`);
    return { event: 'joined', data: { room: `order:${data.order_id}` } };
  }

  @SubscribeMessage('join:user')
  handleJoinUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { user_id: string },
  ) {
    void client.join(`user:${data.user_id}`);
    return { event: 'joined', data: { room: `user:${data.user_id}` } };
  }

  @SubscribeMessage('leave:order')
  handleLeaveOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { order_id: string },
  ) {
    void client.leave(`order:${data.order_id}`);
    return { event: 'left', data: { room: `order:${data.order_id}` } };
  }

  /** Push an order status update to all subscribers of that order and both parties. */
  emitOrderUpdated(payload: {
    order_id: string;
    buyer_id: string;
    seller_id: string;
    rider_id: string | null;
    status: string;
    status_history: unknown[];
  }) {
    this.server.to(`order:${payload.order_id}`).emit('order:updated', payload);
    this.server.to(`user:${payload.buyer_id}`).emit('order:updated', payload);
    this.server.to(`user:${payload.seller_id}`).emit('order:updated', payload);
    if (payload.rider_id) {
      this.server.to(`user:${payload.rider_id}`).emit('order:updated', payload);
    }
  }

  /**
   * Push a notification to a specific user's room. The client side listens
   * to `notification:new` on the /orders namespace (same socket the rest of
   * the live updates flow over) and invalidates the notifications RTK Query
   * cache to refresh the bell + dropdown.
   *
   * Called by OrdersService and DeliveryRequestsService after they've
   * persisted a notification row — kept as a thin pass-through so the
   * gateway has no DB dependency.
   */
  emitNotificationToUser(userId: string, notification: unknown): void {
    this.server.to(`user:${userId}`).emit('notification:new', notification);
  }

  /**
   * Push a delivery-request lifecycle event. Listeners are keyed off the
   * same user rooms used by order:updated — a client only needs to call
   * `join:user <userId>` once to receive everything addressed to them.
   *
   *   new       → rider room (their inbox + toast updates)
   *   accepted  → seller + rider rooms (seller chip flips, rider's pending list clears)
   *   rejected  → seller room
   *   expired   → both rooms
   *   cancelled → rider room
   *
   * Also broadcasts to the order room so the order-detail page reacts live.
   */
  emitDeliveryRequest(
    event:
      | 'delivery_request:new'
      | 'delivery_request:accepted'
      | 'delivery_request:rejected'
      | 'delivery_request:expired'
      | 'delivery_request:cancelled',
    payload: {
      id: string;
      order_id: string;
      seller_id: string;
      rider_user_id: string;
      status: string;
      [k: string]: unknown;
    },
  ): void {
    const toSeller = ['delivery_request:accepted', 'delivery_request:rejected', 'delivery_request:expired']
      .includes(event);
    const toRider = ['delivery_request:new', 'delivery_request:accepted', 'delivery_request:expired', 'delivery_request:cancelled']
      .includes(event);
    if (toSeller) {
      this.server.to(`user:${payload.seller_id}`).emit(event, payload);
    }
    if (toRider) {
      this.server.to(`user:${payload.rider_user_id}`).emit(event, payload);
    }
    this.server.to(`order:${payload.order_id}`).emit(event, payload);
  }
}
