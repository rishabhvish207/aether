import type { Metadata } from "next";
import "./globals.css";
import { brand } from "@/core/domain";
export const metadata: Metadata = {
  title: brand.name,
  description: "Local-first AI workspace",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
