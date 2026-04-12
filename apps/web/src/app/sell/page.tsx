'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, apiPostForm } from '@/lib/api';

interface Category {
  id: string;
  namePt: string;
  slug: string;
}

const conditionOptions = [
  { value: 'NEW_WITH_TAGS', label: 'Novo com etiqueta' },
  { value: 'NEW_WITHOUT_TAGS', label: 'Novo sem etiqueta' },
  { value: 'VERY_GOOD', label: 'Otimo estado' },
  { value: 'GOOD', label: 'Bom estado' },
  { value: 'SATISFACTORY', label: 'Satisfatorio' },
];

const sizes = ['PP', 'P', 'M', 'G', 'GG', 'XG'];

interface UploadedPhoto {
  file: File;
  previewUrl: string;
  uploadedUrl: string | null;
  uploading: boolean;
  error: string | null;
}

export default function SellPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [condition, setCondition] = useState('');
  const [size, setSize] = useState('');
  const [brand, setBrand] = useState('');
  const [price, setPrice] = useState('');
  const [weight, setWeight] = useState('');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch categories on mount
  useEffect(() => {
    apiGet<Category[] | { data: Category[] }>('/listings/categories')
      .then((res) => {
        const list = Array.isArray(res) ? res : (res.data ?? []);
        setCategories(list);
      })
      .catch(() => {
        // Fallback static categories if API is unavailable
        setCategories([
          { id: 'cat-vestidos', namePt: 'Vestidos', slug: 'vestidos' },
          { id: 'cat-calcas', namePt: 'Calcas', slug: 'calcas' },
          { id: 'cat-camisetas', namePt: 'Camisetas', slug: 'camisetas' },
          { id: 'cat-blusas', namePt: 'Blusas', slug: 'blusas' },
          { id: 'cat-saias', namePt: 'Saias', slug: 'saias' },
          { id: 'cat-shorts', namePt: 'Shorts', slug: 'shorts' },
          { id: 'cat-casacos', namePt: 'Casacos', slug: 'casacos' },
          { id: 'cat-sapatos', namePt: 'Sapatos', slug: 'sapatos' },
          { id: 'cat-bolsas', namePt: 'Bolsas', slug: 'bolsas' },
          { id: 'cat-acessorios', namePt: 'Acessorios', slug: 'acessorios' },
        ]);
      });
  }, []);

  const uploadPhoto = async (photo: UploadedPhoto, index: number) => {
    setPhotos((prev) =>
      prev.map((p, i) => (i === index ? { ...p, uploading: true, error: null } : p)),
    );

    try {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
      if (!token) {
        throw new Error('Você precisa estar logado para publicar um anuncio.');
      }

      const formData = new FormData();
      formData.append('file', photo.file);

      const result = await apiPostForm<{ url: string; key: string }>('/uploads/listing-image', formData);

      setPhotos((prev) =>
        prev.map((p, i) =>
          i === index ? { ...p, uploadedUrl: result.url, uploading: false } : p,
        ),
      );
    } catch (err) {
      setPhotos((prev) =>
        prev.map((p, i) =>
          i === index
            ? {
                ...p,
                uploading: false,
                error: err instanceof Error ? err.message : 'Erro ao enviar foto',
              }
            : p,
        ),
      );
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newPhotos: UploadedPhoto[] = Array.from(files)
      .slice(0, 20 - photos.length)
      .map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
        uploadedUrl: null,
        uploading: false,
        error: null,
      }));

    setPhotos((prev) => {
      const merged = [...prev, ...newPhotos].slice(0, 20);
      // Start uploading each new photo
      merged.forEach((p, i) => {
        if (!p.uploadedUrl && !p.uploading && !p.error && i >= prev.length) {
          setTimeout(() => uploadPhoto(p, i), 0);
        }
      });
      return merged;
    });

    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      return updated;
    });
  };

  const retryUpload = (index: number) => {
    const photo = photos[index];
    if (photo) uploadPhoto(photo, index);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const token =
      typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      setError('Voce precisa estar logado para publicar um anuncio.');
      router.push('/auth/login');
      return;
    }

    if (photos.length === 0) {
      setError('Adicione pelo menos uma foto.');
      return;
    }

    const stillUploading = photos.some((p) => p.uploading);
    if (stillUploading) {
      setError('Aguarde o envio das fotos antes de publicar.');
      return;
    }

    const failedUploads = photos.filter((p) => p.error || !p.uploadedUrl);
    if (failedUploads.length > 0) {
      setError('Algumas fotos falharam ao enviar. Remova-as ou tente novamente.');
      return;
    }

    setLoading(true);

    try {
      const imageUrls = photos
        .map((p) => p.uploadedUrl)
        .filter((url): url is string => url !== null);

      const response = await apiPost<{ id: string }>('/listings', {
        title,
        description,
        categoryId,
        condition,
        size: size || undefined,
        brand: brand || undefined,
        priceBrl: parseFloat(price),
        shippingWeightG: weight ? parseInt(weight, 10) : 300,
        imageUrls,
      });

      router.push(`/listings/${encodeURIComponent(response.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao publicar anuncio. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const uploadingCount = photos.filter((p) => p.uploading).length;
  const readyCount = photos.filter((p) => p.uploadedUrl).length;

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
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Fotos {photos.length > 0 && <span className="text-gray-400 font-normal">({readyCount}/{photos.length} prontas)</span>}
          </label>

          {/* Photo previews */}
          {photos.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-3">
              {photos.map((photo, index) => (
                <div key={index} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                  <Image
                    src={photo.previewUrl}
                    alt={`Foto ${index + 1}`}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                  {photo.uploading && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {photo.error && (
                    <div className="absolute inset-0 bg-red-900/60 flex flex-col items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => retryUpload(index)}
                        className="text-white text-xs underline"
                      >
                        Tentar
                      </button>
                    </div>
                  )}
                  {photo.uploadedUrl && !photo.uploading && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="absolute top-1 left-1 w-4 h-4 bg-black/60 text-white rounded-full flex items-center justify-center text-xs leading-none hover:bg-black/80"
                    aria-label="Remover foto"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {photos.length < 20 && (
            <label className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-brand-600 transition cursor-pointer block">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                multiple
                onChange={handlePhotoChange}
                className="hidden"
              />
              <svg className="mx-auto w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-gray-600 mb-1">
                {photos.length === 0 ? 'Clique para adicionar fotos' : 'Adicionar mais fotos'}
              </p>
              <p className="text-xs text-gray-400">JPEG ou PNG, ate 10MB cada · {20 - photos.length} restantes</p>
            </label>
          )}
          {uploadingCount > 0 && (
            <p className="text-xs text-gray-500 mt-2">Enviando {uploadingCount} foto(s)...</p>
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
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent bg-white"
          >
            <option value="">Selecionar categoria</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.namePt}</option>
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
                  required={condition === ''}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* Size */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tamanho <span className="text-gray-400 font-normal">(opcional)</span></label>
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
          <label htmlFor="brand" className="block text-sm font-medium text-gray-700 mb-1">Marca <span className="text-gray-400 font-normal">(opcional)</span></label>
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
              min="1"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0,00"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="weight" className="block text-sm font-medium text-gray-700 mb-1">Peso (g) <span className="text-gray-400 font-normal">(opcional)</span></label>
            <input
              id="weight"
              type="number"
              min="1"
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
          disabled={loading || uploadingCount > 0}
          className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition text-lg disabled:opacity-50"
        >
          {loading ? 'Publicando...' : uploadingCount > 0 ? `Enviando fotos (${uploadingCount})...` : 'Publicar anuncio'}
        </button>
      </form>
    </div>
  );
}
