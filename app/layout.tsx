import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedConnect - Gestión Médica Inteligente",
  description: "Plataforma de historia clínica electrónica y agendamiento automatizado por WhatsApp.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>{children}</body>
    </html>
  );
}
