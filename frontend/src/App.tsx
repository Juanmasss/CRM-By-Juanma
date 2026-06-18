import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";

import { AppLayout } from "@/layouts/AppLayout";
import { ActivitiesPage } from "@/pages/ActivitiesPage";
import { BotsPage } from "@/pages/BotsPage";
import { ChatPage } from "@/pages/ChatPage";
import { CompaniesPage } from "@/pages/CompaniesPage";
import { ContactsPage } from "@/pages/ContactsPage";
import { HomePage } from "@/pages/HomePage";
import { LeadsPage } from "@/pages/LeadsPage";
import { ReportsPage } from "@/pages/ReportsPage";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "leads", element: <LeadsPage /> },
      { path: "contacts", element: <ContactsPage /> },
      { path: "companies", element: <CompaniesPage /> },
      { path: "activities", element: <ActivitiesPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "bots", element: <BotsPage /> },
      { path: "chat", element: <ChatPage /> },
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
