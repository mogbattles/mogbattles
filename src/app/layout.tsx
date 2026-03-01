import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import PageTransition from "@/components/PageTransition";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";

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
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0A0A0A" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Prevent flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.setAttribute('data-theme','light')}else{document.documentElement.setAttribute('data-theme','dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className="min-h-screen font-sans antialiased"
        style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
      >
        <AuthProvider>
          <ThemeProvider>
            <ImpersonationBanner />
            <Navbar />
            {/* pt-14 = below fixed navbar; pb-24 = above fixed bottom nav + safe area */}
            <main className="pt-14 pb-24 lg:pb-8">
              <PageTransition>{children}</PageTransition>
            </main>
            <BottomNav />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
