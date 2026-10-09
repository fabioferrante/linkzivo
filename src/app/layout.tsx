import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Linkzivo — Smart Links, QR Codes & Atribuição de Campanhas",
  description:
    "A plataforma SaaS profissional para gestão de Smart Links, geração de QR Codes dinâmicos de alta resolução e rastreamento de comissões de afiliados com latência sub-20ms.",
  icons: {
    icon: "/brand/logo-icon.png",
    shortcut: "/brand/logo-icon.png",
    apple: "/brand/logo-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark scroll-smooth">
      <head>
        <link rel="icon" href="/brand/logo-icon.png" type="image/png" />
      </head>
      <body className="min-h-screen bg-[#0D0F18] text-white selection:bg-[#4267E9] selection:text-white antialiased">
        {children}
      </body>
    </html>
  );
}
