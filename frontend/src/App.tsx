import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";

import { AppLayout } from "@/layouts/AppLayout";
import { HomePage } from "@/pages/HomePage";
import { LeadsPage } from "@/pages/LeadsPage";
import { PlaceholderPage } from "@/pages/PlaceholderPage";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "leads", element: <LeadsPage /> },
      { path: "contacts", element: <PlaceholderPage title="Contactos" /> },
      { path: "companies", element: <PlaceholderPage title="Empresas" /> },
      { path: "activities", element: <PlaceholderPage title="Actividades" /> },
      { path: "reports", element: <PlaceholderPage title="Reportes" /> },
      { path: "bots", element: <PlaceholderPage title="Bots" /> },
      { path: "chat", element: <PlaceholderPage title="Chat" /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
