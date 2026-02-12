import { useEffect } from 'react';
import { Button } from 'flowbite-react';
import { Plus, Star, Fingerprint, Pencil, Trash2, Unlink } from 'lucide-react';
import type { UploadLibraryItem } from '@/helpers/uploadLibrary';

export interface UploadContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    hash: string | null;
}

interface UploadLibraryContextMenuProps {
    contextMenu: UploadContextMenuState;
    setContextMenu: (menu: UploadContextMenuState) => void;
    items: UploadLibraryItem[];
    selectedHashes: Set<string>;
    onAddToProject: (hashes: string[]) => void;
    onToggleFavorite: (hash: string) => void;
    onIdentify: (hash: string) => void;
    onRename: (hash: string) => void;
    onDelete: (hashes: string[]) => void;
    onUnlink: (hash: string) => void;
}

export function UploadLibraryContextMenu({
    contextMenu,
    setContextMenu,
    items,
    selectedHashes,
    onAddToProject,
    onToggleFavorite,
    onIdentify,
    onRename,
    onDelete,
    onUnlink,
}: UploadLibraryContextMenuProps) {
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (contextMenu.visible) {
                const menuEl = document.getElementById('upload-context-menu');
                if (menuEl && menuEl.contains(e.target as Node)) return;
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ ...contextMenu, visible: false });
            }
        };
        if (contextMenu.visible) {
            window.addEventListener('click', handler, true);
        }
        return () => window.removeEventListener('click', handler, true);
    }, [contextMenu, setContextMenu]);

    if (!contextMenu.visible || !contextMenu.hash) return null;

    const item = items.find(i => i.hash === contextMenu.hash);
    if (!item) return null;

    const isInSelection = selectedHashes.has(contextMenu.hash);
    const hasMultiSelect = selectedHashes.size > 1 && isInSelection;
    const isLinked = !!(item.linkedFrontHash || item.linkedBackHash);
    const close = () => setContextMenu({ ...contextMenu, visible: false });

    if (hasMultiSelect) {
        const count = selectedHashes.size;
        const hashes = Array.from(selectedHashes);
        return (
            <div
                id="upload-context-menu"
                className="fixed bg-white dark:bg-gray-800 border rounded-xl border-gray-300 dark:border-gray-700 shadow-md z-100000 text-sm flex flex-col gap-1"
                style={{ top: contextMenu.y, left: contextMenu.x, padding: '0.25rem' }}
                onMouseLeave={close}
            >
                <Button size="sm" color="green" onClick={() => { onAddToProject(hashes); close(); }}>
                    <Plus className="size-3 mr-1" />Add {count} to Project
                </Button>
                <Button size="sm" onClick={() => { hashes.forEach(onToggleFavorite); close(); }}>
                    <Star className="size-3 mr-1" />Favorite {count}
                </Button>
                <Button size="sm" color="red" onClick={() => { onDelete(hashes); close(); }}>
                    <Trash2 className="size-3 mr-1" />Delete {count}
                </Button>
            </div>
        );
    }

    return (
        <div
            id="upload-context-menu"
            className="fixed bg-white dark:bg-gray-800 border rounded-xl border-gray-300 dark:border-gray-700 shadow-md z-100000 text-sm flex flex-col gap-1"
            style={{ top: contextMenu.y, left: contextMenu.x, padding: '0.25rem' }}
            onMouseLeave={close}
        >
            <Button size="sm" color="green" onClick={() => { onAddToProject([contextMenu.hash!]); close(); }}>
                <Plus className="size-3 mr-1" />Add to Project
            </Button>
            <Button size="sm" onClick={() => { onToggleFavorite(contextMenu.hash!); close(); }}>
                <Star className="size-3 mr-1" />{item.isFavorite ? 'Unfavorite' : 'Favorite'}
            </Button>
            <Button size="sm" onClick={() => { onIdentify(contextMenu.hash!); close(); }}>
                <Fingerprint className="size-3 mr-1" />Identify
            </Button>
            <Button size="sm" onClick={() => { onRename(contextMenu.hash!); close(); }}>
                <Pencil className="size-3 mr-1" />Rename
            </Button>
            {isLinked && (
                <Button size="sm" onClick={() => { onUnlink(contextMenu.hash!); close(); }}>
                    <Unlink className="size-3 mr-1" />Unlink Faces
                </Button>
            )}
            <Button size="sm" color="red" onClick={() => { onDelete([contextMenu.hash!]); close(); }}>
                <Trash2 className="size-3 mr-1" />Delete
            </Button>
        </div>
    );
}
