import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Edtech Studio | Local-First Document Editor',
  description: 'An elite, fault-tolerant offline-first collaborative document editor with RBAC and AI completions.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className={`${inter.variable} font-sans antialiased min-h-screen flex flex-col bg-[#050507]`}>
        {children}
      </body>
    </html>
  );
}
