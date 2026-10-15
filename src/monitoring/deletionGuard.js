export const MAX_DELETIONS = 35;
export const WATCH_POLL_MS = 8000;
// Aguarda duas varreduras sem novas remoções antes de liberar o lote.
export const DELETION_QUIET_MS = WATCH_POLL_MS * 2;

export function createDeletionGuard({ onBatch, onBlocked }) {
  const pending = new Set();
  let timer;
  let blocked = false;

  return {
    isBlocked: () => blocked,
    cancel(filePath) {
      pending.delete(filePath);
      if (pending.size === 0) clearTimeout(timer);
    },
    add(filePath) {
      if (blocked) return;
      pending.add(filePath);
      clearTimeout(timer);

      if (pending.size > MAX_DELETIONS) {
        blocked = true;
        const count = pending.size;
        pending.clear();
        onBlocked(count);
        return;
      }

      timer = setTimeout(() => {
        const batch = [...pending];
        pending.clear();
        onBatch(batch);
      }, DELETION_QUIET_MS);
    },
  };
}
