import Link from 'next/link';

export interface ListingCardProps {
  id: string;
  title: string;
  price: number;
  size: string;
  condition: string;
  sellerName: string;
  imageUrl?: string;
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function ListingCard({
  id,
  title,
  price,
  size,
  condition,
  sellerName,
  imageUrl,
}: ListingCardProps) {
  return (
    <Link href={`/listings/${id}`} className="group block">
      <div className="relative aspect-[4/5] bg-gray-100 rounded-xl overflow-hidden mb-2">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
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
