import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { ProductsService } from '../products/products.service';
import { PssWebhookPayload } from '../../../../../libs/gosellr-types/src';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly productsService: ProductsService,
  ) {
    this.webhookSecret = this.config.getOrThrow<string>('PSS_WEBHOOK_SECRET');
  }

  verifySignature(rawBody: string, signature: string): void {
    const expected = `sha256=${crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex')}`;

    // Constant-time comparison to prevent timing attacks
    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);

    const valid =
      expectedBuf.length === signatureBuf.length &&
      crypto.timingSafeEqual(expectedBuf, signatureBuf);

    if (!valid) {
      this.logger.warn(`Webhook signature mismatch — received: ${signature}`);
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  async handlePssWebhook(
    payload: PssWebhookPayload,
    rawBody: string,
    signature: string,
  ): Promise<{ received: true }> {
    // 1. Verify signature
    this.verifySignature(rawBody, signature);

    this.logger.log(
      `PSS webhook: event=${payload.event} entity=${payload.entity_id} decision=${payload.decision}`,
    );

    // 2. Update product SQ fields — never throw, always return 200
    try {
      await this.productsService.updateSqFromWebhook(
        payload.entity_id,
        payload.event,
        payload.decision,
        payload.sq_level,
        payload.rejection_reason,
        payload.decided_at,
      );
    } catch (err: unknown) {
      this.logger.error(`Webhook handler error: ${String(err)}`);
      // Still return 200 — PSS must NOT retry because of internal errors
    }

    return { received: true };
  }
}
