import { Star, Trash2, Pencil } from 'lucide-react';

export interface CardbackTileProps {
    id: string;
    name: string;
    imageUrl: string;
    source: 'builtin' | 'uploaded';
    isSelected: boolean;
    isDefault: boolean;
    isDeleting: boolean;
    isEditing: boolean;
    editingName: string;
    onSelect: () => void;
    onSetAsDefault: () => void;
    onDelete: () => void;
    onStartEdit: () => void;
    onEditNameChange: (name: string) => void;
    onSaveEdit: () => void;
    onCancelEdit: () => void;
}

/**
 * Reusable cardback tile component with star/delete/edit functionality.
 */
export function CardbackTile({
    id,
    name,
    imageUrl,
    source,
    isSelected,
    isDefault,
    isDeleting,
    isEditing,
    editingName,
    onSelect,
    onSetAsDefault,
    onDelete,
    onStartEdit,
    onEditNameChange,
    onSaveEdit,
    onCancelEdit,
}: CardbackTileProps) {
    const isBlank = id === 'cardback_builtin_blank';
    const isUploaded = source === 'uploaded';

    const borderClasses = isSelected
        ? 'border-green-500'
        : 'border-transparent hover:border-blue-400';

    return (
        <div
            className="relative cursor-pointer group"
            onClick={onSelect}
        >
            {/* Card image or blank placeholder */}
            {isBlank ? (
                <div className={`w-full aspect-[63/88] border-4 rounded-xl flex items-center justify-center ${borderClasses} bg-gradient-to-br from-white/60 to-white/30 dark:from-gray-700/60 dark:to-gray-800/30 backdrop-blur-sm shadow-inner`}>
                    <span className="text-gray-400 dark:text-gray-500 text-xs font-medium italic">No Back</span>
                </div>
            ) : (
                <img
                    src={imageUrl}
                    loading="lazy"
                    className={`w-full border-4 rounded-xl ${borderClasses}`}
                    alt={name}
                />
            )}

            {/* Star button (set as default) */}
            <button
                type="button"
                className="absolute top-1 right-1 p-1 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                onClick={(e) => {
                    e.stopPropagation();
                    onSetAsDefault();
                }}
                title={isDefault ? "Default cardback" : "Set as default cardback"}
            >
                <Star
                    size={16}
                    className={isDefault
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-white/60 group-hover:text-white"
                    }
                />
            </button>

            {/* Delete button for uploaded cardbacks */}
            {isUploaded && (
                <button
                    type="button"
                    className="absolute top-1 left-1 p-1 rounded-full bg-black/50 hover:bg-red-600 transition-colors"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    title={isDeleting ? "Click again to confirm delete" : "Delete cardback"}
                >
                    <Trash2
                        size={16}
                        className={isDeleting
                            ? "text-red-400"
                            : "text-white/60 group-hover:text-white"
                        }
                    />
                </button>
            )}

            {/* Name bar with edit capability */}
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs text-center py-1 rounded-b-xl px-1 flex items-center justify-center gap-1">
                {isEditing ? (
                    <input
                        type="text"
                        value={editingName}
                        onChange={(e) => onEditNameChange(e.target.value)}
                        onBlur={onSaveEdit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.currentTarget.blur();
                            } else if (e.key === 'Escape') {
                                onCancelEdit();
                            }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        className="bg-transparent text-white text-xs text-center w-full border-none outline-none"
                    />
                ) : (
                    <>
                        <span className="truncate">{name}{isDefault && " ★"}</span>
                        {isUploaded && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onStartEdit();
                                }}
                                className="flex-shrink-0 hover:text-blue-300"
                                title="Edit name"
                            >
                                <Pencil size={10} />
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
