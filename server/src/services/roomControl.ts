import type Database from 'better-sqlite3';
import { ROOM_LABELS, RoomMode, RoomState, assertSingleActiveRoom } from '../core/rooms.js';

const ROOMS = new Set<RoomMode>(Object.keys(ROOM_LABELS) as RoomMode[]);

export class RoomControlService {
  constructor(private db: Database.Database) {}

  getState(): { activeRoom: RoomState; triggeredAt: string | null; triggeredBy: string | null } {
    const rows = this.db.prepare(`SELECT key, value FROM system_state WHERE key IN ('active_room','room_triggered_at','room_triggered_by')`).all() as { key: string; value: string }[];
    const state = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      activeRoom: (state.active_room as RoomState) || 'idle',
      triggeredAt: state.room_triggered_at || null,
      triggeredBy: state.room_triggered_by || null,
    };
  }

  activate(room: RoomMode, actor = 'admin') {
    if (!ROOMS.has(room)) throw new Error(`Unknown room: ${room}`);
    const now = new Date().toISOString();
    const upsert = this.db.prepare(`INSERT INTO system_state (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`);
    const tx = this.db.transaction(() => {
      upsert.run('active_room', room, now);
      upsert.run('room_triggered_at', now, now);
      upsert.run('room_triggered_by', actor, now);
      this.db.prepare(`INSERT INTO room_runs (room,status,triggered_by,started_at) VALUES (?,?,?,?)`).run(room, 'active', actor, now);
      this.db.prepare(`UPDATE room_runs SET status='superseded', completed_at=? WHERE room<>? AND status='active'`).run(now, room);
      this.db.prepare(`INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)`).run(actor, 'activate_room', room);
    });
    tx();
    return this.getState();
  }

  setIdle(actor = 'admin') {
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO system_state (key,value,updated_at) VALUES ('active_room','idle',?) ON CONFLICT(key) DO UPDATE SET value='idle',updated_at=excluded.updated_at`).run(now);
      this.db.prepare(`UPDATE room_runs SET status='completed', completed_at=? WHERE status='active'`).run(now);
      this.db.prepare(`INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)`).run(actor, 'rooms_idle', 'all rooms silent');
    });
    tx();
    return this.getState();
  }

  assertActive(room: RoomMode) {
    const state = this.getState();
    assertSingleActiveRoom(state.activeRoom, room);
    return state;
  }
}
