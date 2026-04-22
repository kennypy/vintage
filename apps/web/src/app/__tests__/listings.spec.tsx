import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ListingsPage from '../listings/page';

const mockPush = jest.fn();
const mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
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

jest.mock('../listings/ListingsFilter', () => {
  return {
    __esModule: true,
    default: function MockFilter({ onFilterChange: _onFilterChange }: { onFilterChange: unknown }) {
      return <div data-testid="listings-filter">Filter</div>;
    },
  };
});

const mockListings = [
  { id: '1', title: 'Vestido Farm', price: 89.9, size: 'M', condition: 'Bom', sellerName: 'Ana' },
  { id: '2', title: 'Calca Zara', price: 120, size: 'G', condition: 'Novo', sellerName: 'Maria' },
  { id: '3', title: 'Camiseta Nike', price: 45, size: 'P', condition: 'Otimo', sellerName: 'Joao' },
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
  mockPush.mockClear();
  // Reset search params
  for (const key of [...mockSearchParams.keys()]) {
    mockSearchParams.delete(key);
  }
});

describe('ListingsPage', () => {
  it('renders listing grid from API', async () => {
    mockFetch({ data: mockListings, total: 3, page: 1, totalPages: 1 });
    render(<ListingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Vestido Farm')).toBeInTheDocument();
      expect(screen.getByText('Calca Zara')).toBeInTheDocument();
      expect(screen.getByText('Camiseta Nike')).toBeInTheDocument();
    });
  });

  it('shows loading text while fetching', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    render(<ListingsPage />);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('shows total results count after loading', async () => {
    mockFetch({ data: mockListings, total: 42, page: 1, totalPages: 3 });
    render(<ListingsPage />);

    await waitFor(() => {
      expect(screen.getByText('42 resultados')).toBeInTheDocument();
    });
  });

  it('renders search input', async () => {
    mockFetch({ data: [], total: 0, page: 1, totalPages: 1 });
    render(<ListingsPage />);
    expect(screen.getByPlaceholderText('Buscar roupas, marcas, estilos...')).toBeInTheDocument();
  });

  it('renders sort dropdown with options', async () => {
    mockFetch({ data: [], total: 0, page: 1, totalPages: 1 });
    render(<ListingsPage />);

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(4);
    expect(options[0]).toHaveTextContent('Mais relevantes');
    expect(options[1]).toHaveTextContent('Menor preço');
    expect(options[2]).toHaveTextContent('Maior preço');
    expect(options[3]).toHaveTextContent('Mais recentes');
  });

  it('sort dropdown change triggers new fetch', async () => {
    const fetchMock = mockFetch({ data: [], total: 0, page: 1, totalPages: 1 });
    render(<ListingsPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const initialCallCount = fetchMock.mock.calls.length;

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'price_asc' } });

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it('shows empty state when no results', async () => {
    mockFetch({ data: [], total: 0, page: 1, totalPages: 1 });
    render(<ListingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Nenhum resultado encontrado.')).toBeInTheDocument();
    });
  });

  it('handles API returning an array directly', async () => {
    mockFetch(mockListings);
    render(<ListingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Vestido Farm')).toBeInTheDocument();
    });
  });

  it('renders pagination when multiple pages exist', async () => {
    mockFetch({ data: mockListings, total: 30, page: 1, totalPages: 3 });
    render(<ListingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Anterior')).toBeInTheDocument();
      expect(screen.getByText('Próxima')).toBeInTheDocument();
    });
  });

  it('does not render pagination when only one page', async () => {
    mockFetch({ data: mockListings, total: 3, page: 1, totalPages: 1 });
    render(<ListingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Vestido Farm')).toBeInTheDocument();
    });
    expect(screen.queryByText('Anterior')).not.toBeInTheDocument();
    expect(screen.queryByText('Próxima')).not.toBeInTheDocument();
  });

  it('handles API error gracefully', async () => {
    // Before the useApiQuery refactor, the listings page caught errors
    // and rendered "Nenhum resultado encontrado." — indistinguishable
    // from a legitimate empty result. This hid 500s and made the user
    // think nothing matched their filters. The fetchError banner + retry
    // button is the new correct behavior: surface the error, let the
    // user retry. Asserting the old behavior would regress the fix.
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    render(<ListingsPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/Network error/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeInTheDocument();
    expect(screen.queryByText('Nenhum resultado encontrado.')).not.toBeInTheDocument();
  });
});
