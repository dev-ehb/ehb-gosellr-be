import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'smtp.gmail.com'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
  }

  /**
   * Send a 6-digit OTP code to the given email address.
   * Falls back to console.log in development when SMTP is not configured.
   */
  async sendOtp(to: string, otp: string): Promise<void> {
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');

    if (!smtpUser || !smtpPass) {
      // Dev fallback — print to console so the team can test without SMTP
      this.logger.warn(`[DEV-OTP] ${to} → ${otp} (SMTP not configured — printed to console)`);
      return;
    }

    const from = this.config.get<string>('SMTP_FROM', `"GoSellr" <${smtpUser}>`);

    await this.transporter.sendMail({
      from,
      to,
      subject: 'Your GoSellr verification code',
      text: `Your GoSellr OTP is: ${otp}\n\nIt expires in 10 minutes. Do not share this code.`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;border:1px solid #e5e7eb;border-radius:8px;">
          <h2 style="color:#1a1a1a;margin-bottom:8px;">Verify your email</h2>
          <p style="color:#6b7280;margin-bottom:24px;">Enter the code below in the GoSellr app to verify your email address.</p>
          <div style="background:#f3f4f6;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px;">
            <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1a1a1a;">${otp}</span>
          </div>
          <p style="color:#9ca3af;font-size:14px;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
        </div>
      `,
    });

    this.logger.log(`OTP email sent to ${to}`);
  }
}
