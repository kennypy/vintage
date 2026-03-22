'use client';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-6xl font-bold text-gray-300 mb-4">500</h1>
      <p className="text-lg text-gray-600 mb-8">Algo deu errado</p>
      <button
        onClick={reset}
        className="px-6 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition"
      >
        Tentar novamente
      </button>
    </main>
  );
}
