// sendDigest — the only side-effectful wrapper around renderDigest.
//
// Constitution P3: in prototype mode, NEVER dispatch to the email provider
// even if credentials are configured. The guard is the first thing in the
// function so there's no code path that reaches Resend when PROTOTYPE_MODE=true.

import type { RenderedDigest } from './render.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { previewStore } from './preview-store.js';

export interface SendResult {
  sent: boolean;
  mode: 'prototype_preview' | 'production_send' | 'no_recipients';
  message?: string;
}

/**
 * Deliver (or preview) a digest.
 *
 *   PROTOTYPE_MODE=true  → stash the rendered digest into the preview store.
 *                          The /digest/preview page reads this store to show
 *                          every recipient's envelope. Zero network I/O.
 *
 *   PROTOTYPE_MODE=false → call Resend (not yet implemented; returns a stub
 *                          until a real EMAIL_API_KEY is provisioned and the
 *                          Resend path is wired). For now, production boot
 *                          refuses to start without the key — so this path
 *                          isn't reachable accidentally.
 */
export async function sendDigest(digest: RenderedDigest): Promise<SendResult> {
  if (config.PROTOTYPE_MODE) {
    previewStore.save(digest);
    logger.info(
      {
        recipient: digest.recipient_email,
        scope: digest.scope_label,
        red: digest.counts.red,
        yellow: digest.counts.yellow,
        missing: digest.counts.missing,
      },
      'digest: preview stored (prototype mode)',
    );
    return { sent: false, mode: 'prototype_preview', message: 'Preview stored; no email dispatched.' };
  }

  // Production path. Deliberately left as a TODO so that flipping
  // PROTOTYPE_MODE=false without completing the Resend wiring surfaces
  // immediately rather than silently dropping emails.
  if (!config.EMAIL_API_KEY) {
    logger.error({ recipient: digest.recipient_email }, 'digest: production mode but EMAIL_API_KEY not set');
    return { sent: false, mode: 'no_recipients', message: 'EMAIL_API_KEY missing.' };
  }

  // TODO(post-prototype): wire Resend. Keep the signature stable so that
  // flipping the env flag + filling EMAIL_API_KEY is a one-line change
  // without touching call sites.
  logger.warn({ recipient: digest.recipient_email }, 'digest: Resend wiring not yet implemented — dropped');
  return { sent: false, mode: 'production_send', message: 'Resend integration pending.' };
}
