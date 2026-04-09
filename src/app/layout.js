import "./globals.css";


export const metadata = {
  title: "repositories aibot",
  description: "Ask about your repositories and get answers in natural language",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
