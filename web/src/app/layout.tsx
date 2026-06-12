import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Systrum — architecture map",
  description: "A self-updating map of your software architecture.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
