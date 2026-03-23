import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ListingCard from '../ListingCard';

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

describe('ListingCard', () => {
  const defaultProps = {
    id: '1',
    title: 'Vestido Midi Farm',
    price: 89.9,
    size: 'M',
    condition: 'Bom',
    sellerName: 'Ana Silva',
  };

  it('renders the listing title', () => {
    render(<ListingCard {...defaultProps} />);
    expect(screen.getByText('Vestido Midi Farm')).toBeInTheDocument();
  });

  it('renders the formatted price in BRL', () => {
    render(<ListingCard {...defaultProps} />);
    // toLocaleString pt-BR formats as R$ XX,XX
    const priceEl = screen.getByText(/R\$/);
    expect(priceEl).toBeInTheDocument();
  });

  it('renders size and condition badges', () => {
    render(<ListingCard {...defaultProps} />);
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('Bom')).toBeInTheDocument();
  });

  it('renders seller name', () => {
    render(<ListingCard {...defaultProps} />);
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
  });

  it('links to the listing detail page', () => {
    render(<ListingCard {...defaultProps} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/listings/1');
  });

  it('renders placeholder when no image provided', () => {
    const { container } = render(<ListingCard {...defaultProps} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders image when imageUrl is provided', () => {
    render(<ListingCard {...defaultProps} imageUrl="https://example.com/photo.jpg" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
    expect(img).toHaveAttribute('alt', 'Vestido Midi Farm');
  });
});
