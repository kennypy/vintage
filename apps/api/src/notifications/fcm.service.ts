import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FcmService {
  private readonly logger = new Logger('FcmService');

  constructor(private configService: ConfigService) {
    this.initializeFirebase();
  }

  private initializeFirebase(): void {
    try {
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      if (!projectId) {
        this.logger.warn('FIREBASE_PROJECT_ID not configured — FCM disabled');
        return;
      }
      this.logger.log('Firebase Cloud Messaging configured');
    } catch (error) {
      this.logger.error(`FCM initialization error: ${String(error).slice(0, 200)}`);
    }
  }

  async registerDeviceToken(_userId: string, _token: string): Promise<void> {
    try {
      // TODO: Store token in database
      // await this.db.userDeviceToken.create({ userId, token });
      // this.logger.log(`Registered FCM token for user ${_userId}`);
    } catch (error) {
      this.logger.error(`Failed to register FCM token: ${String(error).slice(0, 200)}`);
    }
  }

  async sendOrderNotification(_userId: string, _orderId: string, _status: string): Promise<void> {
    try {
      // TODO: Send via FCM - titles map will be used when firebase is configured
      // const titles: Record<string, string> = {
      //   pending: 'Pedido criado',
      //   paid: 'Pagamento confirmado',
      //   shipped: 'Seu pedido foi enviado',
      //   delivered: 'Pedido entregue',
      // };
    } catch (error) {
      this.logger.error(`Failed to send order notification: ${String(error).slice(0, 200)}`);
    }
  }

  async sendMessageNotification(_userId: string, _senderName: string): Promise<void> {
    try {
      // TODO: Send via FCM
      // this.logger.log(`Sent message notification to user ${_userId} from ${_senderName}`);
    } catch (error) {
      this.logger.error(`Failed to send message notification: ${String(error).slice(0, 200)}`);
    }
  }

  async sendReviewNotification(_userId: string, _reviewerName: string): Promise<void> {
    try {
      // TODO: Send via FCM
      // this.logger.log(`Sent review notification to user ${_userId} from ${_reviewerName}`);
    } catch (error) {
      this.logger.error(`Failed to send review notification: ${String(error).slice(0, 200)}`);
    }
  }
}
