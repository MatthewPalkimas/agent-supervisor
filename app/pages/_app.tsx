import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';
import { ToastProvider } from '../components/Toast';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Agent Supervisor</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#054A91" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;}catch(e){}})();`,
          }}
        />
      </Head>
      <ToastProvider>
        <Component {...pageProps} />
      </ToastProvider>
    </>
  );
}
