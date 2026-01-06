import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "LaunchSin | AI-Driven Infrastructure Dashboard",
    description: "Enterprise-grade multi-tenant platform for infrastructure and workers management.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="h-full">
            <body
                className={`${inter.variable} h-full antialiased font-sans bg-surface-50 dark:bg-surface-950`}
            >
                <Sidebar />
                <div className="flex h-full flex-col pl-64">
                    <Header />
                    <main className="flex-1 overflow-auto p-8">
                        {children}
                    </main>
                </div>
            </body>
        </html>
    );
}
