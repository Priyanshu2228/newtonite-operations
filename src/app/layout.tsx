import './globals.css';
import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import { AppHeader } from '@/components/app-header';

export const metadata: Metadata = {
  title: 'Newtonite | Operational Work Management',
  description: 'High-concurrency operational work coordination platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <Providers>
          <AppHeader />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
