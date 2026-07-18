import { Logger } from '@nestjs/common';
import { NotificationChannel, OutboundNotification } from './notification-channel.interface';

/** Always-on medium: writes to the server log. Guarantees at least one channel exists. */
export class ConsoleChannel implements NotificationChannel {
  readonly name = 'console';
  private readonly logger = new Logger('Notify');

  isEnabled(): boolean {
    return true;
  }

  async send(n: OutboundNotification): Promise<boolean> {
    const line = `[${n.level.toUpperCase()}] ${n.title} — ${n.message}`;
    if (n.level === 'critical') this.logger.error(line);
    else if (n.level === 'warning') this.logger.warn(line);
    else this.logger.log(line);
    return true;
  }
}
