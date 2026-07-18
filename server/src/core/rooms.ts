/**
 * Room-control service. Enforces the three-room operating model:
 *   Room 1 — Signal Room: crawl platforms, detect signals, no enrichment.
 *   Room 2 — Selection + Enrichment Room: review & enrich selected signals.
 *   Room 3 — Manual Signal Room: operator enters signal, system collects data.
 *
 * Only ONE room is active at a time (backend-enforced). The operator explicitly
 * activates a room; all others are silenced until the active room goes idle.
 */

import type Database from 'better-sqlite3';

export type RoomId = 1 | 2 | 3;
export type RoomState = 'idle' | 'active';

export interface RoomStatus {
  activeRoom: RoomId | null;
  state: RoomState;
  activatedAt: string | null;
  activatedBy: string | null;
}

export class RoomControl {
  constructor(private db: Database.Database) {}

  private getVal(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM system_state WHERE key=?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private setVal(key: string, value: string) {
    this.db.prepare(
      `INSERT INTO system_state (key, value, set_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, set_at=excluded.set_at`
    ).run(key, value);
  }

  getStatus(): RoomStatus {
    const room = this.getVal('active_room');
    return {
      activeRoom: room ? (Number(room) as RoomId) : null,
      state: room ? 'active' : 'idle',
      activatedAt: this.getVal('room_activated_at'),
      activatedBy: this.getVal('room_activated_by'),
    };
  }

  activate(room: RoomId, actor: string = 'operator'): RoomStatus {
    const current = this.getStatus();
    if (current.activeRoom && current.activeRoom !== room) {
      throw new RoomConflictError(current.activeRoom, room);
    }
    this.setVal('active_room', String(room));
    this.setVal('room_activated_at', new Date().toISOString());
    this.setVal('room_activated_by', actor);
    this.db.prepare(
      `INSERT INTO audit_log (actor, action, detail) VALUES (?, 'room_activate', ?)`
    ).run(actor, `Room ${room} activated`);
    return this.getStatus();
  }

  deactivate(actor: string = 'operator'): RoomStatus {
    const current = this.getStatus();
    if (current.activeRoom) {
      this.db.prepare(
        `INSERT INTO audit_log (actor, action, detail) VALUES (?, 'room_deactivate', ?)`
      ).run(actor, `Room ${current.activeRoom} deactivated`);
    }
    this.db.prepare(`DELETE FROM system_state WHERE key IN ('active_room','room_activated_at','room_activated_by')`).run();
    return this.getStatus();
  }

  assertActive(room: RoomId): void {
    const status = this.getStatus();
    if (status.activeRoom !== room) {
      throw new RoomNotActiveError(room, status.activeRoom);
    }
  }
}

export class RoomConflictError extends Error {
  constructor(public currentRoom: RoomId, public requestedRoom: RoomId) {
    super(`Room ${currentRoom} is currently active. Deactivate it before activating Room ${requestedRoom}.`);
  }
}

export class RoomNotActiveError extends Error {
  constructor(public requiredRoom: RoomId, public activeRoom: RoomId | null) {
    super(`Room ${requiredRoom} is not active (current: ${activeRoom ?? 'idle'}). Activate it first.`);
  }
}
