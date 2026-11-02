import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { ConsolePage } from './pages/ConsolePage';
import { OverlayPage } from './pages/OverlayPage';
import { DemoLabPage } from './pages/DemoLabPage';
import { fetchHealth } from './api/client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 5000,
  });

  return (
    <div className="min-h-screen flex flex-col bg-charcoal-900 text-chalk-100 font-sans">
      <Navbar health={health} />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Transparent OBS Overlay (Rendered directly without layout chrome) */}
          <Route path="/overlay/:channelKey" element={<OverlayPage />} />

          {/* Application Views wrapped in Layout */}
          <Route
            path="/"
            element={
              <Layout>
                <HomePage />
              </Layout>
            }
          />
          <Route
            path="/console"
            element={
              <Layout>
                <ConsolePage />
              </Layout>
            }
          />
          <Route
            path="/lab"
            element={
              <Layout>
                <DemoLabPage />
              </Layout>
            }
          />

          {/* Catch-all redirect */}
          <Route
            path="*"
            element={
              <Layout>
                <HomePage />
              </Layout>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

