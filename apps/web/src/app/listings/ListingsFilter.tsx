'use client';

import { useState } from 'react';

const categories = ['Vestidos', 'Calças', 'Camisetas', 'Blusas', 'Sapatos', 'Bolsas', 'Acessórios'];
const conditions = ['Novo com etiqueta', 'Novo', 'Ótimo', 'Bom', 'Satisfatório'];
const sizes = ['PP', 'P', 'M', 'G', 'GG', 'XG'];
const brands = ['Farm', 'Zara', 'Levi\'s', 'Adidas', 'Nike', 'Arezzo', 'Animale', 'Osklen'];

export default function ListingsFilter() {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedCondition, setSelectedCondition] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');

  return (
    <aside className="hidden md:block w-64 shrink-0">
      <div className="space-y-6">
        {/* Category */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Categoria</h3>
          <div className="space-y-2">
            {categories.map((cat) => (
              <label key={cat} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="category"
                  value={cat}
                  checked={selectedCategory === cat}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="text-brand-600 focus:ring-brand-600"
                />
                {cat}
              </label>
            ))}
          </div>
        </div>

        {/* Condition */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Condição</h3>
          <div className="space-y-2">
            {conditions.map((cond) => (
              <label key={cond} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="condition"
                  value={cond}
                  checked={selectedCondition === cond}
                  onChange={(e) => setSelectedCondition(e.target.value)}
                  className="text-brand-600 focus:ring-brand-600"
                />
                {cond}
              </label>
            ))}
          </div>
        </div>

        {/* Size */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Tamanho</h3>
          <div className="flex flex-wrap gap-2">
            {sizes.map((size) => (
              <button
                key={size}
                onClick={() => setSelectedSize(selectedSize === size ? '' : size)}
                className={`px-3 py-1 text-xs rounded-full border transition ${
                  selectedSize === size
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'border-gray-300 text-gray-700 hover:border-brand-600'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* Price range */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Preço (R$)</h3>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Min"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
            <span className="text-gray-400">—</span>
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
          <div className="space-y-2">
            {brands.map((brand) => (
              <label key={brand} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="brand"
                  value={brand}
                  checked={selectedBrand === brand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="text-brand-600 focus:ring-brand-600"
                />
                {brand}
              </label>
            ))}
          </div>
        </div>

        {/* Clear filters */}
        <button
          onClick={() => {
            setSelectedCategory('');
            setSelectedCondition('');
            setSelectedSize('');
            setSelectedBrand('');
            setPriceMin('');
            setPriceMax('');
          }}
          className="w-full text-sm text-brand-600 hover:text-brand-700 transition py-2"
        >
          Limpar filtros
        </button>
      </div>
    </aside>
  );
}
