import { deleteDB, openDB, type DBSchema } from 'idb';
import type { Conversation } from '../types';

interface HistoryDatabase extends DBSchema {
  conversations: {
    key: string;
    value: Conversation;
    indexes: { createdAt: string; pageUrl: string };
  };
}

const DATABASE_NAME = 'ai-web-assistant-history';
const DATABASE_VERSION = 1;

async function database() {
  return openDB<HistoryDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore('conversations', { keyPath: 'id' });
      store.createIndex('createdAt', 'createdAt');
      store.createIndex('pageUrl', 'pageUrl');
    },
  });
}

export async function saveConversation(conversation: Conversation): Promise<void> {
  const db = await database();
  await db.put('conversations', conversation);
}

export async function listConversations(): Promise<Conversation[]> {
  const db = await database();
  const values = await db.getAllFromIndex('conversations', 'createdAt');
  return values.reverse();
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await database();
  await db.delete('conversations', id);
}

export async function clearConversations(): Promise<void> {
  await deleteDB(DATABASE_NAME);
}

export async function removeExpiredConversations(
  retentionDays: number,
  now = Date.now(),
): Promise<number> {
  const cutoff = new Date(now - retentionDays * 86_400_000).toISOString();
  const db = await database();
  const transaction = db.transaction('conversations', 'readwrite');
  let cursor = await transaction.store
    .index('createdAt')
    .openCursor(IDBKeyRange.upperBound(cutoff));
  let removed = 0;
  while (cursor) {
    await cursor.delete();
    removed += 1;
    cursor = await cursor.continue();
  }
  await transaction.done;
  return removed;
}

export function exportHistory(conversations: Conversation[]): string {
  return JSON.stringify(
    {
      format: 'ai-web-assistant-history',
      version: 1,
      exportedAt: new Date().toISOString(),
      conversations,
    },
    null,
    2,
  );
}
