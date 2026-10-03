import './globals.css';
import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import { AppShell } from '@/components/app-shell';

export const metadata: Metadata = {
  title: 'Newtonite | Operations Management',
  description: 'Internal operations coordination platform for high-concurrency work management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
