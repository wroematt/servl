import nodemailer from 'nodemailer';
import { config } from '../config';

const transport = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
});

export async function sendPasswordReset(to: string, resetUrl: string) {
  await transport.sendMail({
    from: config.EMAIL_FROM,
    to,
    subject: 'Reset your Servl password',
    text: `Click this link to reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
    html: `<p>Click <a href="${resetUrl}">here</a> to reset your Servl password.</p><p>This link expires in 1 hour.</p>`,
  });
}
