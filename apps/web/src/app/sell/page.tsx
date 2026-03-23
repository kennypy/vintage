'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/api';

const categories = [
  'Vestidos', 'Calcas', 'Camisetas', 'Blusas', 'Saias', 'Shorts',
  'Casacos', 'Sapatos', 'Bolsas', 'Acessorios',
];

const conditionOptions = [
  { value: 'new_with_tags', label: 'Novo com etiqueta' },
  { value: 'new', label: 'Novo sem etiqueta' },
  { value: 'excellent', label: 'Otimo estado' },
  { value: 'good', label: 'Bom estado' },
  { value: 'fair', label: 'Satisfatorio' },
];

const sizes = ['PP', 'P', 'M', 'G', 'GG', 'XG'];

export default function SellPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('');
  const [size, setSize] = useState('');
  const [brand, setBrand] = useState('');
  const [price, setPrice] = useState('');
  const [weight, setWeight] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const fileArr = Array.from(files).slice(0, 20);
    setPhotos((prev) => [...prev, ...fileArr].slice(0, 20));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const photoBase64: string[] = [];
      for (const photo of photos) {
        const buffer = await photo.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        photoBase64.push(btoa(binary));
      }

      const response = await apiPost<{ id: string }>('/listings', {
        title,
        description,
        category,
        condition,
        size,
        brand,
        price: parseFloat(price),
        weight: weight ? parseInt(weight, 10) : undefined,
        photos: photoBase64.length > 0 ? photoBase64 : undefined,
      });

      router.push(`/listings/${encodeURIComponent(response.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao publicar anuncio. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Vender um item</h1>

      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <form className="space-y-6" onSubmit={handleSubmit}>
        {/* Photos */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Fotos</label>
          <label className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-brand-600 transition cursor-pointer block">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoChange}
              className="hidden"
            />
            <svg className="mx-auto w-10 h-10 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-gray-600 mb-1">Arraste fotos aqui ou clique para selecionar</p>
            <p className="text-xs text-gray-400">Maximo 20 fotos, ate 10MB cada</p>
          </label>
          {photos.length > 0 && (
            <p className="text-xs text-gray-500 mt-2">{photos.length} foto(s) selecionada(s)</p>
          )}
        </div>

        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">Titulo</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Vestido midi estampado Farm"
            required
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Descricao</label>
          <textarea
            id="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descreva o item, estado de conservacao, medidas..."
            required
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent resize-none"
          />
        </div>

        {/* Category */}
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent bg-white"
          >
            <option value="">Selecionar categoria</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Condition */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Condicao</label>
          <div className="space-y-2">
            {conditionOptions.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="condition"
                  value={opt.value}
                  checked={condition === opt.value}
                  onChange={(e) => setCondition(e.target.value)}
                  className="text-brand-600 focus:ring-brand-600"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* Size */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tamanho</label>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(size === s ? '' : s)}
                className={`px-4 py-2 text-sm rounded-lg border transition ${
                  size === s
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'border-gray-300 text-gray-700 hover:border-brand-600'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Brand */}
        <div>
          <label htmlFor="brand" className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
          <input
            id="brand"
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Ex: Zara, Farm, Levi's"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
          />
        </div>

        {/* Price and weight */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">Preco (R$)</label>
            <input
              id="price"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0,00"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="weight" className="block text-sm font-medium text-gray-700 mb-1">Peso (g)</label>
            <input
              id="weight"
              type="number"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="Ex: 300"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
            />
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition text-lg disabled:opacity-50"
        >
          {loading ? 'Publicando...' : 'Publicar anuncio'}
        </button>
      </form>
    </div>
  );
}
