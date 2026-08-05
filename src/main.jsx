import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// MapLibre's stylesheet has to load before ours. Several of its rules are
// single-class selectors on elements we also style (.maplibregl-map on the map
// container, .maplibregl-ctrl-bottom-* on the controls); at equal specificity
// whichever loads last wins, and importing it down in MapView would put it
// last.
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles/theme.css'
import './styles/app.css'
import App from './App.jsx'

// Transit data goes stale on its own schedule, so the hooks set their own
// refetch intervals. Retrying a failed poll once is enough — the next interval
// comes around in 15 seconds anyway.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
