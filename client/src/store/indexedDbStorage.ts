import type { StateStorage } from 'zustand/middleware';
import { db } from '../db';

export const indexedDbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const setting = await db.settings.get(name);
    if (!setting) return null;
    return JSON.stringify(setting.value);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await db.settings.put({ id: name, value: JSON.parse(value) });
  },
  removeItem: async (name: string): Promise<void> => {
    await db.settings.delete(name);
  },
};
