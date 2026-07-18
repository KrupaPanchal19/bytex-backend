export interface OutboundNotification {
  level: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
}

/**
 * A medium a notification can be sent through. Adding e.g. email or SMS later is
 * just a new class implementing this interface — the service loops over whatever
 * channels are registered. `send` resolves true only if the medium accepted it.
 */
export interface NotificationChannel {
  readonly name: string;
  isEnabled(): boolean;
  send(n: OutboundNotification): Promise<boolean>;
}
