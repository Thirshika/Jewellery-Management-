import { Analytics } from '@vercel/analytics/next'
import { cookies } from 'next/headers'
import type { Metadata, Viewport } from 'next'
import { LanguageProvider, type Language } from '@/lib/language'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kanthimathi | Goldsmith Studio',
  description: 'A simple digital diary and jewellery catalogue for Kanthimathi Goldsmith Studio.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const language: Language = cookieStore.get('suvarna_language')?.value === 'ta' ? 'ta' : 'en'

  return (
    <html lang={language}>
      <body className="antialiased">
        <LanguageProvider initialLanguage={language}>
          {children}
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </LanguageProvider>
      </body>
    </html>
  )
}
