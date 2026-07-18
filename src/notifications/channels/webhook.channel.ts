import { Logger } from '@nestjs/common';
import { NotificationChannel, OutboundNotification } from './notification-channel.interface';

/**
 * Optional medium: POSTs to NOTIFY_WEBHOOK_URL (webhook.site, Slack/Discord
 * incoming webhook, etc.). Disabled cleanly when the env var is unset, so the
 * app runs with zero external config but lights up the moment a URL is provided.
 */
export class WebhookChannel implements NotificationChannel {
  readonly name = 'webhook';
  private readonly logger = new Logger('Notify');
  private readonly url = process.env.NOTIFY_WEBHOOK_URL?.trim();

  isEnabled(): boolean {
    return !!this.url;
  }

  async send(n: OutboundNotification): Promise<boolean> {
    if (!this.url) return false;
    try {
      // 3s timeout so a slow/dead webhook never blocks the request path.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // `content`/`text` keys make this render nicely in Discord/Slack too.
          content: `[${n.level.toUpperCase()}] ${n.title} — ${n.message}`,
          text: `[${n.level.toUpperCase()}] ${n.title} — ${n.message}`,
          ...n,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch (err) {
      this.logger.warn(`Webhook delivery failed: ${(err as Error).message}`);
      return false;
    }
  }
}
