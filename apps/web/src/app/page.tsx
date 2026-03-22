export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold text-brand-600 mb-4">Vintage.br</h1>
      <p className="text-lg text-gray-600 text-center max-w-md">
        Compre e venda moda de segunda mão no Brasil.
        <br />
        Sem taxas para vendedores. Proteção ao comprador.
      </p>
      <div className="mt-8 flex gap-4">
        <a
          href="/listings"
          className="px-6 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition"
        >
          Explorar
        </a>
        <a
          href="/sell"
          className="px-6 py-3 border-2 border-brand-600 text-brand-600 rounded-xl font-medium hover:bg-brand-50 transition"
        >
          Vender
        </a>
      </div>
    </main>
  );
}
