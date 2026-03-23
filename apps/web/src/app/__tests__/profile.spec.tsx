import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProfilePage from '../profile/page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

jest.mock('@/components/ListingCard', () => {
  return function MockListingCard({ title, id }: { title: string; id: string }) {
    return <div data-testid={`listing-card-${id}`}>{title}</div>;
  };
});

const mockUser = {
  id: 'user-1',
  name: 'Ana Silva',
  email: 'ana@test.com',
  listings: 5,
  followers: 12,
  following: 8,
};

const mockWallet = { balance: 250.5 };

const mockUserListings = [
  { id: '1', title: 'Vestido Farm', price: 89.9, size: 'M', condition: 'Bom', sellerName: 'Ana Silva' },
  { id: '2', title: 'Calca Zara', price: 120, size: 'G', condition: 'Novo', sellerName: 'Ana Silva' },
];

function setupFetchMock(
  profileResponse: unknown = mockUser,
  walletResponse: unknown = mockWallet,
  listingsResponse: unknown = { data: mockUserListings },
  profileStatus = 200,
) {
  let callCount = 0;
  global.fetch = jest.fn().mockImplementation((url: string) => {
    callCount++;
    if (url.includes('/users/me')) {
      return Promise.resolve({
        ok: profileStatus >= 200 && profileStatus < 300,
        status: profileStatus,
        json: () => Promise.resolve(profileResponse),
        text: () => Promise.resolve(JSON.stringify(profileResponse)),
      });
    }
    if (url.includes('/wallet/balance')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(walletResponse),
        text: () => Promise.resolve(JSON.stringify(walletResponse)),
      });
    }
    if (url.includes('/listings')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(listingsResponse),
        text: () => Promise.resolve(JSON.stringify(listingsResponse)),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}'),
    });
  });
  return { getCallCount: () => callCount };
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockPush.mockClear();
  localStorage.clear();
});

describe('ProfilePage', () => {
  it('redirects to login when not authenticated', () => {
    render(<ProfilePage />);
    expect(mockPush).toHaveBeenCalledWith('/auth/login');
  });

  it('shows loading skeleton while fetching', () => {
    localStorage.setItem('vintage_token', 'test-token');
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    const { container } = render(<ProfilePage />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows user info when authenticated', async () => {
    localStorage.setItem('vintage_token', 'test-token');
    setupFetchMock();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Ana Silva')).toBeInTheDocument();
      expect(screen.getByText('ana@test.com')).toBeInTheDocument();
    });
  });

  it('shows user stats', async () => {
    localStorage.setItem('vintage_token', 'test-token');
    setupFetchMock();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
    });
  });

  it('shows user listings', async () => {
    localStorage.setItem('vintage_token', 'test-token');
    setupFetchMock();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Vestido Farm')).toBeInTheDocument();
      expect(screen.getByText('Calca Zara')).toBeInTheDocument();
    });
  });

  it('shows wallet balance', async () => {
    localStorage.setItem('vintage_token', 'test-token');
    setupFetchMock();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText(/R\$/)).toBeInTheDocument();
    });
  });

  it('logout clears token and redirects to home', async () => {
    localStorage.setItem('vintage_token', 'test-token');
    setupFetchMock();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Sair da conta'));
    expect(localStorage.getItem('vintage_token')).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('redirects to login when profile API fails', async () => {
    localStorage.setItem('vintage_token', 'test-token');
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/users/me')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ message: 'Unauthorized' }),
          text: () => Promise.resolve('Unauthorized'),
        });
      }
      if (url.includes('/wallet/balance')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('{}'),
      });
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/auth/login');
    });
  });

  it('renders profile tabs', async () => {
    localStorage.setItem('vintage_token', 'test-token');
    setupFetchMock();
    render(<ProfilePage />);

    await waitFor(() => {
      // "Anuncios" appears both in stats and tabs, so use getAllByText
      const anunciosElements = screen.getAllByText('Anuncios');
      expect(anunciosElements.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Compras')).toBeInTheDocument();
      expect(screen.getByText('Vendas')).toBeInTheDocument();
      expect(screen.getByText('Avaliacoes')).toBeInTheDocument();
    });
  });

  it('shows empty state when user has no listings', async () => {
    localStorage.setItem('vintage_token', 'test-token');
    setupFetchMock(mockUser, mockWallet, { data: [] });
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Nenhum anuncio publicado ainda.')).toBeInTheDocument();
    });
  });
});
