import './globals.css';

export const metadata = {
  title: 'AIテレアポツール',
  description: '社内向けテレアポ支援ツール',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
