import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ragLM.ai",
  description:
    "A chat assistant for your documents. Ask a question and choose the response you prefer.",
};

// Set the theme before first paint to avoid a flash. Defaults to dark.
const themeScript = `(function(){try{var t=localStorage.getItem('judgelab.theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}else{document.documentElement.setAttribute('data-theme','dark');}}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-ink font-sans text-fg antialiased">{children}</body>
    </html>
  );
}
