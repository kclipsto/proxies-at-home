import type { UploadLibraryItem } from '@/helpers/uploadLibrary';

interface LinkFacesDialogProps {
    hashes: [string, string];
    items: UploadLibraryItem[];
    frontHash: string | null;
    onFrontHashChange: (hash: string) => void;
    dragOver: 'front' | 'back' | null;
    onDragOverChange: (slot: 'front' | 'back' | null) => void;
    onConfirm: () => void;
    onCancel: () => void;
}

export function LinkFacesDialog({
    hashes,
    items,
    frontHash,
    onFrontHashChange,
    dragOver,
    onDragOverChange,
    onConfirm,
    onCancel,
}: LinkFacesDialogProps) {
    const backHash = frontHash ? hashes.find(h => h !== frontHash) || null : null;
    const frontItem = items.find(i => i.hash === frontHash);
    const backItem = items.find(i => i.hash === backHash);

    const handleDragStart = (e: React.DragEvent, hash: string) => {
        e.dataTransfer.setData('text/plain', hash);
    };

    const handleDrop = (e: React.DragEvent, slot: 'front' | 'back') => {
        e.preventDefault();
        const droppedHash = e.dataTransfer.getData('text/plain');
        if (slot === 'front') {
            onFrontHashChange(droppedHash);
        } else {
            const otherHash = hashes.find(h => h !== droppedHash);
            if (otherHash) onFrontHashChange(otherHash);
        }
        onDragOverChange(null);
    };

    const handleDragOver = (e: React.DragEvent, slot: 'front' | 'back') => {
        e.preventDefault();
        onDragOverChange(slot);
    };

    const renderSlot = (label: string, item: UploadLibraryItem | undefined, slot: 'front' | 'back') => (
        <div className="flex flex-col items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</span>
            <div
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-dashed transition-colors ${dragOver === slot ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-300 dark:border-gray-600'
                    }`}
                onDrop={(e) => handleDrop(e, slot)}
                onDragOver={(e) => handleDragOver(e, slot)}
                onDragLeave={() => onDragOverChange(null)}
            >
                {item && (
                    <div
                        className="w-[275px] cursor-grab active:cursor-grabbing"
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.hash)}
                    >
                        <div className="relative w-full" style={{ aspectRatio: '63 / 88' }}>
                            <img
                                src={item.imageUrl}
                                alt={item.displayName}
                                className="w-full h-full object-cover rounded-lg"
                            />
                        </div>
                        <span className="text-xs text-gray-700 dark:text-gray-300 truncate block mt-1 text-center">{item.displayName}</span>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-200000 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 max-w-2xl mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Link Front / Back</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Drag to swap positions</p>
                <div className="flex gap-4 justify-center mb-4">
                    {renderSlot('Front', frontItem, 'front')}
                    {renderSlot('Back', backItem, 'back')}
                </div>
                <div className="flex gap-2 justify-end">
                    <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        Cancel
                    </button>
                    <button onClick={onConfirm} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
                        Link Faces
                    </button>
                </div>
            </div>
        </div>
    );
}
