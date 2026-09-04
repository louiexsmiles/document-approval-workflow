import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import { SiteHeader } from '@/components/site-header';
import { ActingAsProvider } from '@/context/acting-as-context';
import { getUsers } from '@/lib/api';
import './globals.css';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans',
});

export const metadata: Metadata = {
  title: 'Document Approval',
  description: 'Naive document approval workflow starter',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const users = await getUsers();

  return (
    <html lang="en">
      <body className={ibmPlexSans.variable}>
        <ActingAsProvider users={users}>
          <div className="min-h-screen">
            <SiteHeader />
            <main className="mx-auto max-w-5xl px-4 py-10 pb-16">{children}</main>
          </div>
        </ActingAsProvider>
      </body>
    </html>
  );
}
