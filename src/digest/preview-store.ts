// In-memory store for prototype digest previews. Populated by sendDigest()
// when PROTOTYPE_MODE=true; read by the /digest/preview page.
//
// Non-persistent by design: each server boot starts empty, a cron tick (or a
// user hitting "Preview this week's email") repopulates. Keeps the preview
// surface free of stale content across restarts.

import type { RenderedDigest } from './render.js';

class PreviewStore {
  private byEmail = new Map<string, RenderedDigest>();
  private lastGeneratedAt: Date | null = null;

  save(digest: RenderedDigest): void {
    this.byEmail.set(digest.recipient_email, digest);
    this.lastGeneratedAt = new Date();
  }

  list(): RenderedDigest[] {
    return Array.from(this.byEmail.values()).sort((a, b) =>
      a.recipient_email.localeCompare(b.recipient_email),
    );
  }

  clear(): void {
    this.byEmail.clear();
    this.lastGeneratedAt = null;
  }

  lastGenerated(): Date | null {
    return this.lastGeneratedAt;
  }
}

export const previewStore = new PreviewStore();
