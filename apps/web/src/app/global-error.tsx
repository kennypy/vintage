'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '3.75rem', fontWeight: 700, color: '#d1d5db', marginBottom: '1rem' }}>500</h1>
          <p style={{ fontSize: '1.125rem', color: '#4b5563', marginBottom: '2rem' }}>Algo deu errado</p>
          <button
            onClick={reset}
            style={{ padding: '0.75rem 1.5rem', backgroundColor: '#2545e8', color: 'white', borderRadius: '0.75rem', fontWeight: 500, border: 'none', cursor: 'pointer' }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
