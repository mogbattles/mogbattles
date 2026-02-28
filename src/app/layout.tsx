import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import PageTransition from "@/components/PageTransition";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { AuthProvider } from "@/context/AuthContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

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
    <html lang="en" className={inter.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0A0A12" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-navy-900 text-white min-h-screen font-sans antialiased">
        <AuthProvider>
          <ImpersonationBanner />
          <Navbar />
          {/* pt-14 = below fixed navbar; pb-24 = above fixed bottom nav + safe area */}
          <main className="pt-14 pb-24 lg:pb-8">
            <PageTransition>{children}</PageTransition>
          </main>
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
