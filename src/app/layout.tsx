import type { Metadata } from 'next';
import { Be_Vietnam_Pro, Bricolage_Grotesque } from 'next/font/google';
import './globals.css';

const fontDisplay = Bricolage_Grotesque({
  subsets: ['latin', 'vietnamese'],
  weight: ['600', '700'],
  variable: '--font-display-loaded',
  display: 'swap',
});

const fontBody = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body-loaded',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Flashcard TOEIC — FlashcardX',
  description: 'Ứng dụng học từ vựng TOEIC bằng Flashcard lưu tiến độ theo tài khoản.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${fontDisplay.variable} ${fontBody.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('toeic_flashcards_theme');if(!t&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)t='dark';document.documentElement.setAttribute('data-theme',t||'light');}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
