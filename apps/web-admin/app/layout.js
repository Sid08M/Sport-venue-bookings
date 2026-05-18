import './global.css';

export const metadata = {
  title: 'SportsOS Admin Portal',
  description: 'Next-Gen Sports Operating System Central Console',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
