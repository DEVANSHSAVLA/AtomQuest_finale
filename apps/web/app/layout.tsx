import './globals.css';
import type { Metadata } from 'next';
import QueryProvider from '../lib/providers/QueryProvider';

export const metadata: Metadata = {
  title: 'SupportStream | Real-Time Video Support Platform',
  description: 'Enterprise-grade server-routed WebRTC video assistance for support operations.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script src="https://accounts.google.com/gsi/client" async defer></script>
      </head>
      <body className="antialiased min-h-screen flex flex-col">
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
