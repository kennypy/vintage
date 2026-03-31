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

const mockUser = {
  id: 'user-1',
  name: 'Ana Silva',
  email: 'ana@test.com',
  verified: true,
  bio: 'Amo moda sustentável',
  phone: '',
  cpf: '',
};

function setupFetchMock(
  profileResponse: unknown = mockUser,
  profileStatus = 200,
) {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (url.includes('/users/me/addresses')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
        text: () => Promise.resolve('[]'),
      });
    }
    if (url.includes('/users/me')) {
      return Promise.resolve({
        ok: profileStatus >= 200 && profileStatus < 300,
        status: profileStatus,
        json: () => Promise.resolve(profileResponse),
        text: () => Promise.resolve(JSON.stringify(profileResponse)),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}'),
    });
  });
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

  it('shows sidebar navigation items', async () => {
    localStorage.setItem('vintage_token', 'test-token');
    setupFetchMock();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Perfil')).toBeInTheDocument();
      expect(screen.getByText('Conta')).toBeInTheDocument();
      expect(screen.getByText('Pagamentos')).toBeInTheDocument();
      expect(screen.getByText('Postagem')).toBeInTheDocument();
      expect(screen.getByText('Segurança')).toBeInTheDocument();
      expect(screen.getByText('Notificações')).toBeInTheDocument();
      expect(screen.getByText('Idioma')).toBeInTheDocument();
      expect(screen.getByText('Aparência')).toBeInTheDocument();
      expect(screen.getByText('Privacidade')).toBeInTheDocument();
    });
  });

  it('shows profile details section by default', async () => {
    localStorage.setItem('vintage_token', 'test-token');
    setupFetchMock();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Detalhes do Perfil')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Escolha um nome de utilizador')).toBeInTheDocument();
    });
  });

  it('logout clears token and redirects to home', async () => {
    localStorage.setItem('vintage_token', 'test-token');
    setupFetchMock();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Sair'));
    expect(localStorage.getItem('vintage_token')).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('redirects to login when profile API fails', async () => {
    localStorage.setItem('vintage_token', 'test-token');
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/users/me/addresses')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
      }
      return Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Unauthorized' }),
        text: () => Promise.resolve('Unauthorized'),
      });
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/auth/login');
    });
  });

  it('navigates to security section when clicked', async () => {
    localStorage.setItem('vintage_token', 'test-token');
    setupFetchMock();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Segurança')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Segurança'));

    await waitFor(() => {
      expect(screen.getByText('Verificação em 2 Etapas')).toBeInTheDocument();
    });
  });

  it('navigates to notifications section when clicked', async () => {
    localStorage.setItem('vintage_token', 'test-token');
    setupFetchMock();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Notificações')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Notificações'));

    await waitFor(() => {
      expect(screen.getByText('Canais de Notificação')).toBeInTheDocument();
    });
  });

  it('navigates to privacy section when clicked', async () => {
    localStorage.setItem('vintage_token', 'test-token');
    setupFetchMock();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Privacidade')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Privacidade'));

    await waitFor(() => {
      expect(screen.getByText('Definições de Privacidade')).toBeInTheDocument();
    });
  });
});
