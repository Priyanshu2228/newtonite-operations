import './globals.css';
import type { Metadata } from 'next';

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
        {children}
      </body>
    </html>
  );
}
