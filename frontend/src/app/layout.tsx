import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import "../../public/editor-assets/editor.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "DataForge Studio — Local data workspace",
  description:
    "A local workspace for Python, SQL, datasets, and reusable ETL pipelines.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
