'use client';

import { useState, useEffect } from 'react';

export interface FilterState {
  category: string;
  condition: string;
  size: string;
  brand: string;
  priceMin: string;
  priceMax: string;
}

interface ListingsFilterProps {
  onFilterChange?: (filters: FilterState) => void;
}

const categories = ['Vestidos', 'Calcas', 'Camisetas', 'Blusas', 'Saias', 'Shorts', 'Casacos', 'Sapatos', 'Bolsas', 'Acessorios'];
const conditions = [
  { value: 'NEW_WITH_TAGS', label: 'Novo com etiqueta' },
  { value: 'NEW_WITHOUT_TAGS', label: 'Novo sem etiqueta' },
  { value: 'VERY_GOOD', label: 'Otimo estado' },
  { value: 'GOOD', label: 'Bom estado' },
  { value: 'SATISFACTORY', label: 'Satisfatorio' },
];
const sizes = ['PP', 'P', 'M', 'G', 'GG', 'XG'];
const brands = ['Farm', 'Zara', "Levi's", 'Adidas', 'Nike', 'Arezzo', 'Animale', 'Osklen'];

function ChipButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-full border transition ${
        active
          ? 'bg-brand-600 text-white border-brand-600'
          : 'border-gray-300 text-gray-700 hover:border-brand-600 hover:text-brand-600'
      }`}
    >
      {label}
    </button>
  );
}

export default function ListingsFilter({ onFilterChange }: ListingsFilterProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedCondition, setSelectedCondition] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  const hasActiveFilters =
    selectedCategory || selectedCondition || selectedSize || selectedBrand || priceMin || priceMax;

  useEffect(() => {
    if (onFilterChange) {
      onFilterChange({
        category: selectedCategory,
        condition: selectedCondition,
        size: selectedSize,
        brand: selectedBrand,
        priceMin,
        priceMax,
      });
    }
  }, [selectedCategory, selectedCondition, selectedSize, selectedBrand, priceMin, priceMax, onFilterChange]);

  const clearFilters = () => {
    setSelectedCategory('');
    setSelectedCondition('');
    setSelectedSize('');
    setSelectedBrand('');
    setPriceMin('');
    setPriceMax('');
  };

  const toggle = (current: string, value: string, set: (v: string) => void) => {
    set(current === value ? '' : value);
  };

  const filterContent = (
    <div className="space-y-6">
      {/* Category */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Categoria</h3>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <ChipButton
              key={cat}
              label={cat}
              active={selectedCategory === cat}
              onClick={() => toggle(selectedCategory, cat, setSelectedCategory)}
            />
          ))}
        </div>
      </div>

      {/* Condition */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Condicao</h3>
        <div className="flex flex-wrap gap-2">
          {conditions.map((cond) => (
            <ChipButton
              key={cond.value}
              label={cond.label}
              active={selectedCondition === cond.value}
              onClick={() => toggle(selectedCondition, cond.value, setSelectedCondition)}
            />
          ))}
        </div>
      </div>

      {/* Size */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Tamanho</h3>
        <div className="flex flex-wrap gap-2">
          {sizes.map((size) => (
            <ChipButton
              key={size}
              label={size}
              active={selectedSize === size}
              onClick={() => toggle(selectedSize, size, setSelectedSize)}
            />
          ))}
        </div>
      </div>

      {/* Price range */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Preco (R$)</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          <span className="text-gray-400 flex-shrink-0">&mdash;</span>
          <input
            type="number"
            placeholder="Max"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>
      </div>

      {/* Brand */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Marca</h3>
        <div className="flex flex-wrap gap-2">
          {brands.map((brand) => (
            <ChipButton
              key={brand}
              label={brand}
              active={selectedBrand === brand}
              onClick={() => toggle(selectedBrand, brand, setSelectedBrand)}
            />
          ))}
        </div>
      </div>

      {/* Clear filters */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="w-full text-sm text-brand-600 hover:text-brand-700 transition py-2 border border-brand-200 rounded-lg hover:bg-brand-50"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile toggle button */}
      <div className="md:hidden mb-4">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl text-sm text-gray-700 hover:border-brand-600 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          Filtros
          {hasActiveFilters && (
            <span className="w-2 h-2 bg-brand-600 rounded-full" />
          )}
        </button>

        {mobileOpen && (
          <div className="mt-3 p-4 border border-gray-200 rounded-xl bg-white shadow-sm">
            {filterContent}
          </div>
        )}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:block w-64 shrink-0">
        {filterContent}
      </aside>
    </>
  );
}
