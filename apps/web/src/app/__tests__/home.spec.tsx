import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../page';

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// Mock ListingCard
jest.mock('@/components/ListingCard', () => {
  return function MockListingCard({ title, id }: { title: string; id: string }) {
    return <div data-testid={`listing-card-${id}`}>{title}</div>;
  };
});

const mockListings = [
  { id: '1', title: 'Vestido Farm', price: 89.9, size: 'M', condition: 'Bom', sellerName: 'Ana' },
  { id: '2', title: 'Calca Zara', price: 120, size: 'G', condition: 'Novo', sellerName: 'Maria' },
];

function mockFetch(body: unknown, status = 200) {
  const fn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  global.fetch = fn;
  return fn;
}

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('Home page', () => {
  it('renders the hero section with heading', async () => {
    mockFetch({ data: [] });
    await act(async () => { render(<Home />); });
    await waitFor(() => expect(screen.getByText(/Moda de segunda mao/)).toBeInTheDocument());
    expect(screen.getByText(/com estilo e economia/)).toBeInTheDocument();
  });

  it('renders hero call-to-action links', async () => {
    mockFetch({ data: [] });
    await act(async () => { render(<Home />); });
    await waitFor(() => expect(screen.getByText('Explorar pecas')).toBeInTheDocument());
    expect(screen.getByText('Comecar a vender')).toBeInTheDocument();
  });

  it('shows loading skeletons while fetching', () => {
    // Never resolve fetch
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    const { container } = render(<Home />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders featured listings from API', async () => {
    mockFetch({ data: mockListings });
    render(<Home />);
    await waitFor(() => {
      expect(screen.getByText('Vestido Farm')).toBeInTheDocument();
      expect(screen.getByText('Calca Zara')).toBeInTheDocument();
    });
  });

  it('renders featured listings when API returns array', async () => {
    mockFetch(mockListings);
    render(<Home />);
    await waitFor(() => {
      expect(screen.getByText('Vestido Farm')).toBeInTheDocument();
    });
  });

  it('handles API error gracefully', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    render(<Home />);
    await waitFor(() => {
      expect(screen.getByText('Nenhum anuncio disponivel no momento.')).toBeInTheDocument();
    });
  });

  it('shows empty state when API returns empty list', async () => {
    mockFetch({ data: [] });
    render(<Home />);
    await waitFor(() => {
      expect(screen.getByText('Nenhum anuncio disponivel no momento.')).toBeInTheDocument();
    });
  });

  it('shows the Destaques section heading', async () => {
    mockFetch({ data: [] });
    await act(async () => { render(<Home />); });
    await waitFor(() => expect(screen.getByText('Destaques')).toBeInTheDocument());
  });

  it('renders category grid with all categories', async () => {
    mockFetch({ data: [] });
    await act(async () => { render(<Home />); });
    await waitFor(() => expect(screen.getByText('Categorias')).toBeInTheDocument());
    expect(screen.getByText('Moda Feminina')).toBeInTheDocument();
    expect(screen.getByText('Moda Masculina')).toBeInTheDocument();
    expect(screen.getByText('Calcados')).toBeInTheDocument();
    // Bolsas appears in both search bubbles and category grid
    expect(screen.getAllByText('Bolsas').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Acessorios').length).toBeGreaterThanOrEqual(1);
    // Vintage appears in both search bubbles and category grid
    expect(screen.getAllByText('Vintage').length).toBeGreaterThanOrEqual(1);
  });

  it('renders how it works section', async () => {
    mockFetch({ data: [] });
    await act(async () => { render(<Home />); });
    await waitFor(() => expect(screen.getByText('Como funciona')).toBeInTheDocument());
    expect(screen.getByText('Encontre')).toBeInTheDocument();
    expect(screen.getByText('Compre')).toBeInTheDocument();
    expect(screen.getByText('Receba')).toBeInTheDocument();
  });

  it('renders search bar', async () => {
    mockFetch({ data: [] });
    await act(async () => { render(<Home />); });
    await waitFor(() => expect(screen.getByPlaceholderText(/Buscar/)).toBeInTheDocument());
  });

  it('renders search bubble suggestions', async () => {
    mockFetch({ data: [] });
    await act(async () => { render(<Home />); });
    await waitFor(() => expect(screen.getByText('Vestidos')).toBeInTheDocument());
    expect(screen.getByText('Tenis')).toBeInTheDocument();
  });
});
