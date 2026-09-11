import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Workspace } from "./components/Workspace";
import "./styles.css";

export function App() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 750 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Workspace />
    </QueryClientProvider>
  );
}
