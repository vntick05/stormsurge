import "./globals.css";
import { ThemeRegistry } from "@/app/theme-registry";

export const metadata = {
  title: "StormStudio",
  description: "Modern React workspace for PWS ingest and hierarchy editing",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
