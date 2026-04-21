import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const mockNotifications = {
  createNotification: jest.fn().mockResolvedValue(null),
};

const mockPrisma = {
  order: {
    findUnique: jest.fn(),
  },
  review: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  user: {
    update: jest.fn(),
  },
};

describe('ReviewsService', () => {
  let service: ReviewsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  describe('create', () => {
    const mockOrder = {
      id: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      status: 'COMPLETED',
    };

    it('should create a review with valid rating', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(mockOrder);
      mockPrisma.review.findUnique.mockResolvedValue(null);
      const createdReview = { id: 'review-1', rating: 5, orderId: 'order-1' };
      mockPrisma.review.create.mockResolvedValue(createdReview);
      mockPrisma.review.aggregate.mockResolvedValue({
        _avg: { rating: 5 },
        _count: { rating: 1 },
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.create('buyer-1', 'order-1', 5, 'Ótimo!');

      expect(result).toEqual(createdReview);
    });

    it('should reject rating that is not 1 or 5', async () => {
      await expect(service.create('buyer-1', 'order-1', 3)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('buyer-1', 'order-1', 3)).rejects.toThrow(
        'Avaliação deve ser 1 ou 5 estrelas',
      );
    });

    it('should reject if order is not COMPLETED', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({ ...mockOrder, status: 'PENDING' });

      await expect(service.create('buyer-1', 'order-1', 5)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('buyer-1', 'order-1', 5)).rejects.toThrow(
        'Só é possível avaliar pedidos concluídos',
      );
    });

    it('should reject if reviewer is not the buyer', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(mockOrder);

      await expect(service.create('other-user', 'order-1', 5)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.create('other-user', 'order-1', 5)).rejects.toThrow(
        'Apenas o comprador pode avaliar',
      );
    });

    it('should reject duplicate review', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(mockOrder);
      mockPrisma.review.findUnique.mockResolvedValue({ id: 'existing-review' });

      await expect(service.create('buyer-1', 'order-1', 5)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('buyer-1', 'order-1', 5)).rejects.toThrow(
        'Você já avaliou este pedido',
      );
    });

    it('should reject if order not found', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);

      await expect(service.create('buyer-1', 'nonexistent', 5)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.create('buyer-1', 'nonexistent', 5)).rejects.toThrow(
        'Pedido não encontrado',
      );
    });
  });

  describe('getUserReviews', () => {
    it('should return paginated reviews', async () => {
      const reviews = [
        { id: 'review-1', rating: 5, reviewer: { id: 'u-1', name: 'Ana', avatarUrl: null } },
        { id: 'review-2', rating: 1, reviewer: { id: 'u-2', name: 'João', avatarUrl: null } },
      ];
      mockPrisma.review.findMany.mockResolvedValue(reviews);
      mockPrisma.review.count.mockResolvedValue(2);

      const result = await service.getUserReviews('user-1', 1, 20);

      expect(result).toMatchObject({
        total: 2,
        page: 1,
        totalPages: 1,
      });
      expect(result.items).toHaveLength(2);
    });

    it('should calculate totalPages correctly', async () => {
      const reviews = Array.from({ length: 10 }, (_, i) => ({ id: `review-${i}`, reviewer: { id: `u-${i}`, name: 'X', avatarUrl: null } }));
      mockPrisma.review.findMany.mockResolvedValue(reviews);
      mockPrisma.review.count.mockResolvedValue(25);

      const result = await service.getUserReviews('user-1', 1, 10);

      expect(result.totalPages).toBe(3);
    });
  });
});
