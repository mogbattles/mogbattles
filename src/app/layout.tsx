import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "MogBattles — Who Mogs Who?",
  description: "Vote on who mogs who. ELO-ranked attractiveness battles.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0C1020" />
      </head>
      <body className="bg-navy-900 text-white min-h-screen font-sans antialiased">
        <AuthProvider>
          <Navbar />
          {/* pt-14 = below fixed navbar; pb-24 = above fixed bottom nav + safe area */}
          <main className="pt-14 pb-24 lg:pb-8">{children}</main>
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
