import "./globals.css";

export const metadata = {
  title: "Perfect PWS Workbench",
  description: "Structured PWS review workspace",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
