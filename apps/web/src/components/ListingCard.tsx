'use client';

import React, { memo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { apiPost } from '@/lib/api';
import { formatBRL } from '@/lib/i18n';

export interface ListingCardProps {
  id: string;
  title: string;
  price: number;
  size: string;
  condition: string;
  sellerName: string;
  imageUrl?: string;
  favorited?: boolean;
  onToggleFavorite?: (id: string, favorited: boolean) => void;
}

function ListingCard({
  id,
  title,
  price,
  size,
  condition,
  sellerName,
  imageUrl,
  favorited,
  onToggleFavorite,
}: ListingCardProps) {
  const handleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) return;

    try {
      const res = await apiPost<{ favorited: boolean }>(`/listings/${encodeURIComponent(id)}/favorite`);
      onToggleFavorite?.(id, res.favorited);
    } catch {
      // silently fail
    }
  };

  return (
    <Link href={`/listings/${id}`} className="group block relative">
      <div className="relative aspect-[4/5] bg-gray-100 rounded-xl overflow-hidden mb-2">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
        {/* Favorite button */}
        {onToggleFavorite !== undefined && (
          <button
            type="button"
            onClick={handleFavorite}
            className="absolute top-2 right-2 p-1.5 bg-white/80 rounded-full hover:bg-white transition shadow-sm"
            aria-label={favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          >
            <svg
              className={`w-5 h-5 ${favorited ? 'text-red-500 fill-current' : 'text-gray-400'}`}
              fill={favorited ? 'currentColor' : 'none'}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </button>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-gray-900">{formatBRL(price)}</p>
        <p className="text-sm text-gray-700 truncate">{title}</p>
        <div className="flex gap-1.5">
          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{size}</span>
          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{condition}</span>
        </div>
        <p className="text-xs text-gray-400">{sellerName}</p>
      </div>
    </Link>
  );
}

export default memo(ListingCard);
