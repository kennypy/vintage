import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ListingsFilter from '../../app/listings/ListingsFilter';

describe('ListingsFilter', () => {
  it('renders category filter options', () => {
    render(<ListingsFilter />);
    expect(screen.getByText('Categoria')).toBeInTheDocument();
    expect(screen.getByText('Vestidos')).toBeInTheDocument();
    expect(screen.getByText('Calcas')).toBeInTheDocument();
    expect(screen.getByText('Camisetas')).toBeInTheDocument();
    expect(screen.getByText('Blusas')).toBeInTheDocument();
    expect(screen.getByText('Sapatos')).toBeInTheDocument();
    expect(screen.getByText('Bolsas')).toBeInTheDocument();
    expect(screen.getByText('Acessorios')).toBeInTheDocument();
  });

  it('renders condition filter options', () => {
    render(<ListingsFilter />);
    expect(screen.getByText('Condicao')).toBeInTheDocument();
    expect(screen.getByText('Novo com etiqueta')).toBeInTheDocument();
    expect(screen.getByText('Novo sem etiqueta')).toBeInTheDocument();
    expect(screen.getByText('Otimo estado')).toBeInTheDocument();
    expect(screen.getByText('Bom estado')).toBeInTheDocument();
    expect(screen.getByText('Satisfatorio')).toBeInTheDocument();
  });

  it('renders size filter buttons', () => {
    render(<ListingsFilter />);
    expect(screen.getByText('Tamanho')).toBeInTheDocument();
    expect(screen.getByText('PP')).toBeInTheDocument();
    expect(screen.getByText('P')).toBeInTheDocument();
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('G')).toBeInTheDocument();
    expect(screen.getByText('GG')).toBeInTheDocument();
    expect(screen.getByText('XG')).toBeInTheDocument();
  });

  it('renders price range inputs', () => {
    render(<ListingsFilter />);
    expect(screen.getByText('Preco (R$)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Min')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Max')).toBeInTheDocument();
  });

  it('renders brand filter options', () => {
    render(<ListingsFilter />);
    expect(screen.getByText('Marca')).toBeInTheDocument();
    expect(screen.getByText('Farm')).toBeInTheDocument();
    expect(screen.getByText('Zara')).toBeInTheDocument();
    expect(screen.getByText("Levi's")).toBeInTheDocument();
    expect(screen.getByText('Nike')).toBeInTheDocument();
  });

  it('shows clear filters button only when a filter is active', async () => {
    render(<ListingsFilter />);
    expect(screen.queryByText('Limpar filtros')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Vestidos'));
    await waitFor(() => {
      expect(screen.getByText('Limpar filtros')).toBeInTheDocument();
    });
  });

  it('calls onFilterChange when category chip is clicked', async () => {
    const onFilterChange = jest.fn();
    render(<ListingsFilter onFilterChange={onFilterChange} />);

    fireEvent.click(screen.getByText('Vestidos'));

    await waitFor(() => {
      const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1][0];
      expect(lastCall.category).toBe('Vestidos');
    });
  });

  it('calls onFilterChange when condition chip is clicked', async () => {
    const onFilterChange = jest.fn();
    render(<ListingsFilter onFilterChange={onFilterChange} />);

    fireEvent.click(screen.getByText('Novo sem etiqueta'));

    await waitFor(() => {
      const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1][0];
      expect(lastCall.condition).toBe('NEW_WITHOUT_TAGS');
    });
  });

  it('size filter toggles on click', async () => {
    const onFilterChange = jest.fn();
    render(<ListingsFilter onFilterChange={onFilterChange} />);

    const mButton = screen.getByText('M');
    fireEvent.click(mButton);

    await waitFor(() => {
      const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1][0];
      expect(lastCall.size).toBe('M');
    });

    // Click again to deselect
    fireEvent.click(mButton);

    await waitFor(() => {
      const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1][0];
      expect(lastCall.size).toBe('');
    });
  });

  it('price range filter works', async () => {
    const onFilterChange = jest.fn();
    render(<ListingsFilter onFilterChange={onFilterChange} />);

    fireEvent.change(screen.getByPlaceholderText('Min'), { target: { value: '50' } });
    fireEvent.change(screen.getByPlaceholderText('Max'), { target: { value: '200' } });

    await waitFor(() => {
      const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1][0];
      expect(lastCall.priceMin).toBe('50');
      expect(lastCall.priceMax).toBe('200');
    });
  });

  it('brand filter works', async () => {
    const onFilterChange = jest.fn();
    render(<ListingsFilter onFilterChange={onFilterChange} />);

    fireEvent.click(screen.getByText('Zara'));

    await waitFor(() => {
      const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1][0];
      expect(lastCall.brand).toBe('Zara');
    });
  });

  it('clear filters resets all selections', async () => {
    const onFilterChange = jest.fn();
    render(<ListingsFilter onFilterChange={onFilterChange} />);

    // Set some filters
    fireEvent.click(screen.getByText('Vestidos'));
    fireEvent.click(screen.getByText('M'));
    fireEvent.change(screen.getByPlaceholderText('Min'), { target: { value: '50' } });

    // Clear button should now be visible
    await waitFor(() => {
      expect(screen.getByText('Limpar filtros')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Limpar filtros'));

    await waitFor(() => {
      const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1][0];
      expect(lastCall.category).toBe('');
      expect(lastCall.condition).toBe('');
      expect(lastCall.size).toBe('');
      expect(lastCall.brand).toBe('');
      expect(lastCall.priceMin).toBe('');
      expect(lastCall.priceMax).toBe('');
    });
  });
});
