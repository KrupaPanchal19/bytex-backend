import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';
import { ConsoleChannel } from './channels/console.channel';
import { WebhookChannel } from './channels/webhook.channel';
import {
  NotificationChannel,
  OutboundNotification,
} from './channels/notification-channel.interface';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notify');
  private readonly channels: NotificationChannel[];

  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
  ) {
    // Register every medium; each decides for itself whether it's enabled.
    this.channels = [new ConsoleChannel(), new WebhookChannel()];
  }

  /**
   * Fan a notification out to every enabled medium, then persist it (with the
   * list of mediums that accepted it) so the frontend can show a feed.
   * De-duplication is the caller's job (analytics guards against spam).
   */
  async dispatch(n: OutboundNotification): Promise<Notification> {
    const enabled = this.channels.filter((c) => c.isEnabled());
    const results = await Promise.all(
      enabled.map(async (c) => ({ name: c.name, ok: await c.send(n).catch(() => false) })),
    );
    const delivered = results.filter((r) => r.ok).map((r) => r.name);

    const record = this.repo.create({
      level: n.level,
      title: n.title,
      message: n.message,
      channels: delivered,
      read: false,
    });
    return this.repo.save(record);
  }

  async list(unreadOnly = false): Promise<Notification[]> {
    return this.repo.find({
      where: unreadOnly ? { read: false } : {},
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async unreadCount(): Promise<number> {
    return this.repo.count({ where: { read: false } });
  }

  async markRead(id: string): Promise<void> {
    await this.repo.update({ id }, { read: true });
  }

  async markAllRead(): Promise<void> {
    await this.repo.update({ read: false }, { read: true });
  }

  /** Names of the mediums currently active — surfaced in the UI footer. */
  activeChannels(): string[] {
    return this.channels.filter((c) => c.isEnabled()).map((c) => c.name);
  }
}
