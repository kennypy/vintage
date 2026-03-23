import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders title text', () => {
    const { getByText } = render(
      <EmptyState icon="heart-outline" title="Nenhum favorito" />,
    );
    expect(getByText('Nenhum favorito')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    const { getByText } = render(
      <EmptyState
        icon="heart-outline"
        title="Nenhum favorito"
        subtitle="Explore e favorite itens"
      />,
    );
    expect(getByText('Explore e favorite itens')).toBeTruthy();
  });

  it('does not render subtitle when not provided', () => {
    const { queryByText } = render(
      <EmptyState icon="heart-outline" title="Nenhum favorito" />,
    );
    // Only title should be present, no extra text
    expect(queryByText('Explore e favorite itens')).toBeNull();
  });

  it('renders action button when actionLabel provided', () => {
    const onAction = jest.fn();
    const { getByText } = render(
      <EmptyState
        icon="cart-outline"
        title="Carrinho vazio"
        actionLabel="Explorar"
        onAction={onAction}
      />,
    );
    expect(getByText('Explorar')).toBeTruthy();
  });

  it('calls onAction when button is pressed', () => {
    const onAction = jest.fn();
    const { getByText } = render(
      <EmptyState
        icon="cart-outline"
        title="Carrinho vazio"
        actionLabel="Explorar"
        onAction={onAction}
      />,
    );

    fireEvent.press(getByText('Explorar'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('does not render button when no actionLabel', () => {
    const { queryByText } = render(
      <EmptyState icon="heart-outline" title="Vazio" />,
    );
    expect(queryByText('Explorar')).toBeNull();
  });
});
