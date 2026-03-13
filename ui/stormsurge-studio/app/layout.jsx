import { CssBaseline } from "@mui/material";
import "./globals.css";

export const metadata = {
  title: "StormSurge Studio",
  description: "Modern React workspace for PWS ingest and hierarchy editing",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <CssBaseline />
        {children}
      </body>
    </html>
  );
}
