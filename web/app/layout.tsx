import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Limited Edition Drop",
  description: "Exclusive product drop — enter for a chance to purchase",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-background">{children}</body>
    </html>
  );
}
