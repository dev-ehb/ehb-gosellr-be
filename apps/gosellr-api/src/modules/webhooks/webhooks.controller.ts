import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { Request } from 'express';
import { WebhooksService } from './webhooks.service';
import { PssWebhookPayload } from '../../../../../libs/gosellr-types/src';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * POST /webhooks/pss
   *
   * Receives SQ decision events from PSS.
   * ALWAYS returns 200 — non-2xx causes PSS to retry.
   * Signature verification happens inside WebhooksService.
   */
  @Post('pss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive SQ decision webhook from PSS' })
  @ApiHeader({
    name: 'x-pss-signature',
    description: 'HMAC-SHA256 signature from PSS: sha256=<hex>',
    required: true,
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Webhook received and processed' })
  async handlePssWebhook(
    @Body() payload: PssWebhookPayload,
    @Headers('x-pss-signature') signature: string,
    @Req() req: Request,
  ): Promise<{ received: true }> {
    // Raw body for HMAC verification — express buffers it as string via JSON middleware
    const rawBody = JSON.stringify(payload);

    try {
      return await this.webhooksService.handlePssWebhook(payload, rawBody, signature ?? '');
    } catch (err: unknown) {
      this.logger.error(`Webhook top-level error: ${String(err)}`);
      // Return 200 regardless — log the error but don't cause retries
      return { received: true };
    }
  }
}
