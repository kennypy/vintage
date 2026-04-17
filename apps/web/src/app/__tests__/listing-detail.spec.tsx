import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ListingDetailClient from '../listings/[id]/ListingDetailClient';

// Keep legacy test signature: tests pass { params: { id } } to a wrapper.
function ListingDetailPage({ params }: { params: { id: string } }) {
  return <ListingDetailClient id={params.id} />;
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

jest.mock('next/image', () => {
  return function MockImage(props: Record<string, unknown>) {
    // eslint-disable-next-line
    return <img {...props} />;
  };
});

const mockListing = {
  id: 'abc-123',
  title: 'Vestido Midi Farm Estampado',
  price: 189.9,
  condition: 'Otimo estado',
  size: 'M',
  brand: 'Farm',
  color: 'Estampado',
  description: 'Vestido midi da Farm em otimo estado, usado apenas 2 vezes.',
  sellerName: 'Ana Silva',
  sellerRating: 4.8,
  sellerReviews: 42,
  shippingEstimate: '3-5 dias uteis',
  images: [
    'https://example.com/img1.jpg',
    'https://example.com/img2.jpg',
    'https://example.com/img3.jpg',
  ],
};

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

describe('ListingDetailPage', () => {
  it('shows loading state initially', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    const { container } = render(<ListingDetailPage params={{ id: 'abc-123' }} />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders listing details from API', async () => {
    mockFetch(mockListing);
    render(<ListingDetailPage params={{ id: 'abc-123' }} />);

    await waitFor(() => {
      expect(screen.getByText('Vestido Midi Farm Estampado')).toBeInTheDocument();
    });

    expect(screen.getByText('Otimo estado')).toBeInTheDocument();
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('Farm')).toBeInTheDocument();
    expect(screen.getByText('Estampado')).toBeInTheDocument();
  });

  it('renders the listing description', async () => {
    mockFetch(mockListing);
    render(<ListingDetailPage params={{ id: 'abc-123' }} />);

    await waitFor(() => {
      expect(screen.getByText(/usado apenas 2 vezes/)).toBeInTheDocument();
    });
  });

  it('displays formatted price in BRL', async () => {
    mockFetch(mockListing);
    render(<ListingDetailPage params={{ id: 'abc-123' }} />);

    await waitFor(() => {
      expect(screen.getByText(/R\$/)).toBeInTheDocument();
    });
  });

  it('shows 404 when listing not found', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: 'Not found' }),
      text: () => Promise.resolve('API Error 404: Not found'),
    });
    render(<ListingDetailPage params={{ id: 'nonexistent' }} />);

    await waitFor(() => {
      expect(screen.getByText('Anuncio nao encontrado')).toBeInTheDocument();
    });
    expect(screen.getByText(/nao existe ou foi removido/)).toBeInTheDocument();
  });

  it('displays listing images', async () => {
    mockFetch(mockListing);
    render(<ListingDetailPage params={{ id: 'abc-123' }} />);

    await waitFor(() => {
      const images = screen.getAllByRole('img');
      expect(images.length).toBeGreaterThanOrEqual(1);
      expect(images[0]).toHaveAttribute('src', 'https://example.com/img1.jpg');
    });
  });

  it('shows seller info', async () => {
    mockFetch(mockListing);
    render(<ListingDetailPage params={{ id: 'abc-123' }} />);

    await waitFor(() => {
      expect(screen.getByText('Ana Silva')).toBeInTheDocument();
      expect(screen.getByText(/4\.8/)).toBeInTheDocument();
      expect(screen.getByText(/42 avaliacoes/)).toBeInTheDocument();
    });
  });

  it('shows seller initial when no avatar', async () => {
    mockFetch(mockListing);
    render(<ListingDetailPage params={{ id: 'abc-123' }} />);

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
    });
  });

  it('renders action buttons', async () => {
    mockFetch(mockListing);
    render(<ListingDetailPage params={{ id: 'abc-123' }} />);

    await waitFor(() => {
      expect(screen.getByText('Comprar agora')).toBeInTheDocument();
      expect(screen.getByText('Fazer oferta')).toBeInTheDocument();
    });
  });

  it('renders shipping estimate', async () => {
    mockFetch(mockListing);
    render(<ListingDetailPage params={{ id: 'abc-123' }} />);

    await waitFor(() => {
      expect(screen.getByText(/3-5 dias uteis/)).toBeInTheDocument();
    });
  });

  it('renders back link to listings', async () => {
    mockFetch(mockListing);
    render(<ListingDetailPage params={{ id: 'abc-123' }} />);

    await waitFor(() => {
      expect(screen.getByText('Vestido Midi Farm Estampado')).toBeInTheDocument();
    });

    const backLink = screen.getByText(/Voltar para resultados/);
    expect(backLink.closest('a')).toHaveAttribute('href', '/listings');
  });
});
