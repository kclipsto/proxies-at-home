import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useProjectStore } from '@/store';



export type SyncStatus = 'idle' | 'pending' | 'syncing' | 'synced' | 'error';

export interface UseShareSyncResult {
    syncStatus: SyncStatus;
    lastSyncedAt: number | null;
}

export function useShareSync(): UseShareSyncResult {
    const currentProjectId = useProjectStore((state) => state.currentProjectId);

    // Get current project to check if it was shared
    const project = useLiveQuery(async () => {
        if (!currentProjectId) return null;
        return db.projects.get(currentProjectId);
    }, [currentProjectId]);

    const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
    const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
    const prevProjectId = useRef<string | null>(null);

    // Watch for updates to lastSharedAt to trigger feedback
    useEffect(() => {
        if (!project) return;

        // If project changed, just update state without feedback
        if (project.id !== prevProjectId.current) {
            setLastSyncedAt(project.lastSharedAt ?? null);
            setSyncStatus('idle');
            prevProjectId.current = project.id;
            return;
        }

        // Same project, but timestamp changed -> it was a sync!
        if (project.lastSharedAt && project.lastSharedAt !== lastSyncedAt) {
            setLastSyncedAt(project.lastSharedAt);
            setSyncStatus('synced');

            const timer = setTimeout(() => {
                setSyncStatus((current) => current === 'synced' ? 'idle' : current);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [project, lastSyncedAt]);

    return {
        syncStatus,
        lastSyncedAt
    };
}
