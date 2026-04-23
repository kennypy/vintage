import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Orders E2E', () => {
  let app: INestApplication;
  let authToken: string;
  let orderId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Register and login
    const signupRes = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
      });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'test@example.com',
        password: 'Password123!',
      });

    authToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/orders', () => {
    it('should create an order', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          listingId: 'listing-1',
          quantity: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
      expect(res.body.totalCents).toBeGreaterThan(0);
      orderId = res.body.id;
    });
  });

  describe('GET /api/v1/orders/:id', () => {
    it('should get order by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(orderId);
      expect(res.body.status).toBe('pending');
    });
  });

  describe('GET /api/v1/orders/user/:userId', () => {
    it('should list user orders', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/orders/user/user-1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('PATCH /api/v1/orders/:id/status', () => {
    it('should update order status', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'shipped' });

      expect(res.status).toBe(200);
      expect(res.body.newStatus).toBe('shipped');
    });
  });
});
