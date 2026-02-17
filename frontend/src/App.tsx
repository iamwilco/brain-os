import { RouterProvider } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { router } from "./router"
import { ToastContainer, useToasts } from "@/components/ui/toast"
import { useRunToasts } from "@/hooks/useRunToasts"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
})

function ToastWrapper() {
  const { toasts, dismiss } = useToasts()
  useRunToasts()
  return <ToastContainer toasts={toasts} onDismiss={dismiss} />
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastWrapper />
    </QueryClientProvider>
  )
}

export default App
