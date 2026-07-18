import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type NotificationLevel = 'info' | 'warning' | 'critical';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40 })
  level: NotificationLevel;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 500 })
  message: string;

  // Which mediums actually accepted this notification (e.g. ["console","webhook"]).
  @Column({ type: 'jsonb', default: () => "'[]'" })
  channels: string[];

  @Column({ type: 'boolean', default: false })
  @Index()
  read: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
