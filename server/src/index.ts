/**
 * Alchemist Signal Forge — API server entry.
 * Serves the JSON API and, in production, the built dashboard.
 */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate } from './db/index.js';
import { api } from './routes/api.js';
import { roomsRouter } from './routes/rooms.js';
import { migrateRooms } from './db/schema-rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);

migrate();
migrateRooms();

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'signal-forge' }));
app.use('/api', api);
app.use('/api', roomsRouter);

// Serve built dashboard if present (production single-artifact deploy).
const webDist = path.join(__dirname, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`\n⚗️  Alchemist Signal Forge API → http://localhost:${PORT}`);
  console.log(`   Dashboard dev server → http://localhost:5173\n`);
});
