import type { Metadata } from "next";
import "./globals.css";
import AuthGate from "./components/AuthGate";

export const metadata: Metadata = {
  title: "COSMOS Smart Document Management",
  description: "Controlled project information repository with external drive connections",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><AuthGate>{children}</AuthGate></body>
    </html>
  );
}
