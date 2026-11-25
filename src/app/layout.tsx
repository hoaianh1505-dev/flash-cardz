import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="vi" suppressHydrationWarning>
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
