import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private firebaseApp: admin.app.App | null = null;
  private readonly isDev: boolean;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    const serviceAccountJson = this.config.get<string>(
      'FIREBASE_SERVICE_ACCOUNT_JSON',
    );
    this.isDev = !serviceAccountJson;

    if (!this.isDev && serviceAccountJson) {
      try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        this.logger.log('Firebase Admin SDK inicializado');
      } catch (error) {
        this.logger.error(
          `Falha ao inicializar Firebase: ${String(error).slice(0, 200)}`,
        );
        this.isDev = true;
      }
    } else {
      this.logger.log(
        'Firebase não configurado — push notifications serão logadas no console (modo desenvolvimento)',
      );
    }
  }

  async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    try {
      const deviceTokens = await this.prisma.deviceToken.findMany({
        where: { userId },
        select: { token: true },
      });

      if (deviceTokens.length === 0) {
        this.logger.debug(
          `Nenhum device token encontrado para o usuário ${userId}`,
        );
        return;
      }

      const tokens = deviceTokens.map((dt) => dt.token);

      if (this.isDev || !this.firebaseApp) {
        this.logger.log(
          `[PUSH DEV] Usuário: ${userId} | Título: ${title} | Corpo: ${body} | Tokens: ${tokens.length}`,
        );
        return;
      }

      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: { title, body },
        data: data ?? {},
      };

      const response = await this.firebaseApp.messaging().sendEachForMulticast(message);

      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(tokens[idx]);
            this.logger.warn(
              `Falha ao enviar push para token: ${String(resp.error).slice(0, 200)}`,
            );
          }
        });

        // Remove invalid tokens
        if (failedTokens.length > 0) {
          await this.prisma.deviceToken.deleteMany({
            where: {
              token: { in: failedTokens },
              userId,
            },
          });
        }
      }

      this.logger.log(
        `Push enviado para ${response.successCount}/${tokens.length} dispositivos do usuário ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Falha ao enviar push notification para usuário ${userId}: ${String(error).slice(0, 200)}`,
      );
    }
  }

  async registerDeviceToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android',
  ): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token },
      update: { userId, platform },
      create: { userId, token, platform },
    });
    this.logger.log(
      `Device token registrado para usuário ${userId} (${platform})`,
    );
  }

  async removeDeviceToken(userId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({
      where: { token, userId },
    });
    this.logger.log(`Device token removido para usuário ${userId}`);
  }
}
