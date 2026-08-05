import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

// Feature routes land here in later phases:
//   gtfs.js     -> /api/stops/nearby, /api/routes, /api/shapes/:routeId
//   realtime.js -> /api/vehicles, live arrivals
//   routing.js  -> /api/plan

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
})
