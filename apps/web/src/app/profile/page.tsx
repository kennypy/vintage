import ListingCard from '@/components/ListingCard';

const mockUser = {
  name: 'Ana Silva',
  email: 'ana@email.com',
  avatarInitial: 'A',
  listings: 12,
  followers: 48,
  following: 23,
  walletBalance: 450.0,
};

const mockUserListings = [
  { id: '1', title: 'Vestido Midi Farm', price: 89.9, size: 'M', condition: 'Bom', sellerName: 'Ana Silva' },
  { id: '5', title: 'Bolsa Arezzo Couro', price: 250, size: 'U', condition: 'Ótimo', sellerName: 'Ana Silva' },
  { id: '7', title: 'Saia Midi Animale', price: 180, size: 'P', condition: 'Novo', sellerName: 'Ana Silva' },
  { id: '8', title: 'Jaqueta Jeans Levi\'s', price: 135, size: 'M', condition: 'Ótimo', sellerName: 'Ana Silva' },
];

const tabs = ['Anúncios', 'Compras', 'Vendas', 'Avaliações'];

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function ProfilePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* User info card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="w-20 h-20 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 font-bold text-2xl">
            {mockUser.avatarInitial}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-xl font-bold text-gray-900">{mockUser.name}</h1>
            <p className="text-sm text-gray-500 mb-4">{mockUser.email}</p>

            {/* Stats */}
            <div className="flex justify-center sm:justify-start gap-6">
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{mockUser.listings}</p>
                <p className="text-xs text-gray-500">Anúncios</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{mockUser.followers}</p>
                <p className="text-xs text-gray-500">Seguidores</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{mockUser.following}</p>
                <p className="text-xs text-gray-500">Seguindo</p>
              </div>
            </div>
          </div>

          {/* Wallet */}
          <div className="bg-gray-50 rounded-xl p-4 text-center min-w-[160px]">
            <p className="text-xs text-gray-500 mb-1">Saldo da carteira</p>
            <p className="text-xl font-bold text-pix">{formatBRL(mockUser.walletBalance)}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-6 overflow-x-auto">
          {tabs.map((tab, index) => (
            <button
              key={tab}
              className={`pb-3 text-sm font-medium border-b-2 whitespace-nowrap transition ${
                index === 0
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Listing grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
        {mockUserListings.map((listing) => (
          <ListingCard key={listing.id} {...listing} />
        ))}
      </div>
    </div>
  );
}
