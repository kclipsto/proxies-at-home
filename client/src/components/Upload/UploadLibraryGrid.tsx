import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
    Star,
    Pencil,
    Trash2,
    Fingerprint,
    Unlink,
    ChevronDown,
    ChevronRight,
    RefreshCw,
    Check,
} from "lucide-react";
import { CardGrid } from "../common";
import { CardImageSvg } from "../common/CardImageSvg";
import { ScryfallAutocompleteInput } from "../common/ScryfallAutocompleteInput";
import { UploadLibraryFilterBar } from "../common/CardArtFilterBar/UploadLibraryFilterBar";
import {
    filterUploadLibraryItems,
    sortUploadLibraryItems,
    getUploadLibraryGroupKey,
    updateUploadLibraryMetadata,
    deleteUploadLibraryItem,
    unlinkUploadFaces,
    type UploadLibraryItem,
    type UploadLibrarySortKey,
} from "@/helpers/uploadLibrary";
import { getCardByName } from "@/helpers/scryfallApi";
import { useToastStore } from "@/store/toast";
import { useUserPreferencesStore } from "@/store";
import type { ScryfallCard } from "../../../../shared/types";
import { ManaIcon, type ManaSymbol } from "../common/ManaIcon";

interface TileActionButtonsProps {
    displayItem: UploadLibraryItem;
    isLinked: boolean;
    backPartner: UploadLibraryItem | undefined;
    mode: UploadLibraryGridMode;
    onFavorite: (hash: string) => void;
    onIdentify: (hash: string, query: string) => void;
    onRename: (hash: string, name: string) => void;
    onDelete: (hash: string) => void;
    onUnlink: (hash: string) => void;
}
function TileActionButtons({
    displayItem,
    isLinked,
    backPartner,
    mode,
    onFavorite,
    onIdentify,
    onRename,
    onDelete,
    onUnlink,
}: TileActionButtonsProps) {
    return (
        <div
            className={`absolute right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 ${isLinked && backPartner ? "top-8" : "top-1"}`}
        >
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onFavorite(displayItem.hash);
                }}
                className="w-6 h-6 flex items-center justify-center rounded-sm bg-white hover:bg-gray-100"
                title={
                    displayItem.isFavorite ? "Remove from favorites" : "Add to favorites"
                }
            >
                <Star
                    className={`w-3.5 h-3.5 ${displayItem.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-gray-700"}`}
                />
            </button>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onIdentify(
                        displayItem.hash,
                        displayItem.canonicalCardName || displayItem.displayName
                    );
                }}
                className={`w-6 h-6 flex items-center justify-center rounded-sm bg-white hover:bg-gray-100 ${displayItem.canonicalCardName ? "text-blue-500" : "text-gray-700"}`}
                title={displayItem.canonicalCardName ? "Update ID" : "Identify card"}
            >
                <Fingerprint className="w-3.5 h-3.5" />
            </button>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onRename(displayItem.hash, displayItem.displayName);
                }}
                className="w-6 h-6 flex items-center justify-center rounded-sm bg-white text-gray-700 hover:bg-gray-100"
                title="Rename"
            >
                <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete(displayItem.hash);
                }}
                className="w-6 h-6 flex items-center justify-center rounded-sm bg-white text-gray-700 hover:bg-red-100 hover:text-red-600"
                title="Delete"
            >
                <Trash2 className="w-3.5 h-3.5" />
            </button>
            {isLinked && mode === "editor" && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onUnlink(displayItem.hash);
                    }}
                    className="w-6 h-6 flex items-center justify-center rounded-sm bg-white text-gray-700 hover:bg-orange-100 hover:text-orange-600"
                    title="Unlink faces"
                >
                    <Unlink className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
}

interface TileIdentifyOverlayProps {
    displayItem: UploadLibraryItem;
    matchingQuery: string;
    matchedCardResult: ScryfallCard | null;
    onMatchCard: (hash: string, name: string) => void;
    onUnmatch: (hash: string) => void;
    onClose: () => void;
}
function TileIdentifyOverlay({
    displayItem,
    matchingQuery,
    matchedCardResult,
    onMatchCard,
    onUnmatch,
    onClose,
}: TileIdentifyOverlayProps) {
    return (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-2 z-30 rounded-[2.5mm]">
            <ScryfallAutocompleteInput
                initialValue={matchingQuery}
                onSelect={(name) => onMatchCard(displayItem.hash, name)}
                onCancel={onClose}
            />
            {matchedCardResult ? (
                <div className="mt-2 flex flex-col items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200 w-full px-4">
                    <div className="text-xs text-green-400 font-medium flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        Identified
                    </div>
                    <div className="flex flex-col items-center text-center w-full">
                        <div className="text-sm font-bold text-white mb-1 flex items-center justify-center gap-2 flex-wrap">
                            {matchedCardResult.name}
                            {matchedCardResult.colors &&
                                matchedCardResult.colors.length > 0 && (
                                    <div className="flex gap-0.5">
                                        {matchedCardResult.colors.map((c) => (
                                            <ManaIcon
                                                key={c}
                                                symbol={c as ManaSymbol}
                                                size={14}
                                                className="rounded-full"
                                            />
                                        ))}
                                    </div>
                                )}
                        </div>
                        <div className="text-xs text-gray-300 italic mb-1">
                            {matchedCardResult.type_line}
                        </div>
                    </div>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                        className="px-6 py-1.5 bg-white text-gray-900 text-xs font-bold rounded-full hover:bg-gray-100 transition-colors shadow-sm mt-1"
                    >
                        Done
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onUnmatch(displayItem.hash);
                            onClose();
                        }}
                        className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
                    >
                        Remove ID
                    </button>
                </div>
            ) : (
                displayItem.canonicalCardName && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onUnmatch(displayItem.hash);
                            onClose();
                        }}
                        className="mt-2 text-xs text-red-400 hover:text-red-300"
                    >
                        Remove ID
                    </button>
                )
            )}
        </div>
    );
}

interface TileFlipButtonProps {
    uploadHash: string;
    isFlipped: boolean;
    onToggleFlip: (hash: string) => void;
}
function TileFlipButton({
    uploadHash,
    isFlipped,
    onToggleFlip,
}: TileFlipButtonProps) {
    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                onToggleFlip(uploadHash);
            }}
            className={`absolute right-1 top-1 w-6 h-6 rounded-sm flex items-center justify-center cursor-pointer group-hover:opacity-100 select-none z-20 transition-colors ${isFlipped
                ? "bg-blue-500 text-white opacity-100"
                : "bg-white text-gray-700 opacity-50 hover:bg-gray-100"
                }`}
            title={isFlipped ? "Show front" : "Show back"}
        >
            <RefreshCw className="w-3.5 h-3.5" />
        </div>
    );
}

export type UploadLibraryGridMode = "editor" | "artwork-modal" | "search";

export interface UploadLibraryGridProps {
    mode: UploadLibraryGridMode;
    items: UploadLibraryItem[];
    onRefresh: () => Promise<void>;
    cardSize: number;
    query?: string;
    filtersCollapsed?: boolean;
    selectedHashes?: Set<string>;
    onToggleSelect?: (hash: string, shiftKey: boolean) => void;
    selectedHash?: string;
    onSelectItem?: (item: UploadLibraryItem) => void;
    onDisplayItemsChange?: (items: UploadLibraryItem[]) => void;
    onContextMenu?: (e: React.MouseEvent, hash: string) => void;
    pendingIdentifyHash?: string | null;
    pendingRenameHash?: string | null;
    onPendingActionHandled?: () => void;
    selectedFace?: "front" | "back";
}

export function UploadLibraryGrid({
    mode,
    items,
    onRefresh,
    cardSize,
    query: externalQuery,
    filtersCollapsed = false,
    selectedHashes,
    onToggleSelect,
    selectedHash,
    onSelectItem,
    onDisplayItemsChange,
    onContextMenu,
    pendingIdentifyHash,
    pendingRenameHash,
    onPendingActionHandled,
    selectedFace,
}: UploadLibraryGridProps) {
    const [sortBy, setSortBy] = useState<UploadLibrarySortKey>("date");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [typeFilters, setTypeFilters] = useState<string[]>([]);
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const [groupBy, setGroupBy] = useState(false);
    const [allTypesCollapsed, setAllTypesCollapsed] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
        new Set()
    );
    const [editingHash, setEditingHash] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const [matchingHash, setMatchingHash] = useState<string | null>(null);
    const [matchingQuery, setMatchingQuery] = useState("");
    const [flippedHashes, setFlippedHashes] = useState<Set<string>>(new Set());
    useEffect(() => {
        setFlippedHashes(new Set());
    }, [selectedFace]);
    const [matchedCardResult, setMatchedCardResult] =
        useState<ScryfallCard | null>(null);

    const itemsMap = useMemo(
        () => new Map(items.map((i) => [i.hash, i])),
        [items]
    );

    useEffect(() => {
        if (pendingIdentifyHash) {
            const item = itemsMap.get(pendingIdentifyHash);
            if (item) {
                setMatchingHash(pendingIdentifyHash);
                setMatchingQuery(item.canonicalCardName || item.displayName);
            }
            onPendingActionHandled?.();
        }
    }, [pendingIdentifyHash, itemsMap, onPendingActionHandled]);

    useEffect(() => {
        if (pendingRenameHash) {
            const item = itemsMap.get(pendingRenameHash);
            if (item) {
                setEditingHash(pendingRenameHash);
                setEditingName(item.displayName);
                setMatchingHash(null);
            }
            onPendingActionHandled?.();
        }
    }, [pendingRenameHash, itemsMap, onPendingActionHandled]);

    // Pre-fetch matched card data when opening match dialog
    useEffect(() => {
        if (!matchingHash) {
            setMatchedCardResult(null);
            return;
        }
        const item = itemsMap.get(matchingHash);
        if (item?.canonicalCardName) {
            getCardByName(item.canonicalCardName).then((card) => {
                if (card) {
                    setMatchedCardResult((prev) =>
                        prev?.name === card.name ? prev : card
                    );
                }
            });
        } else {
            setMatchedCardResult(null);
        }
    }, [matchingHash, itemsMap]);

    const userSort = useUserPreferencesStore(
        (s) => s.preferences?.uploadLibrarySort
    );
    const userSortDir = useUserPreferencesStore(
        (s) => s.preferences?.uploadLibrarySortDirection
    );
    const userGroupBy = useUserPreferencesStore(
        (s) => s.preferences?.favoriteUploadLibraryGroupByType
    );
    const sortInitRef = useRef(false);
    const groupInitRef = useRef(false);

    if (!sortInitRef.current && (userSort || userSortDir)) {
        if (userSort) setSortBy(userSort);
        if (userSortDir) setSortDir(userSortDir);
        sortInitRef.current = true;
    }
    if (!groupInitRef.current && userGroupBy !== undefined) {
        setGroupBy(userGroupBy);
        groupInitRef.current = true;
    }

    const query = externalQuery ?? "";
    const filtered = useMemo(() => {
        const result = filterUploadLibraryItems(items, {
            query: query || undefined,
            types: typeFilters.length > 0 ? typeFilters : undefined,
            isFavoriteOnly: favoritesOnly,
        });
        return sortUploadLibraryItems(result, sortBy, sortDir);
    }, [items, query, typeFilters, favoritesOnly, sortBy, sortDir]);

    const displayItems = useMemo(() => {
        let result = filtered;
        if (query) {
            const q = query.toLowerCase();
            const filteredHashes = new Set(result.map((i) => i.hash));
            const extras: UploadLibraryItem[] = [];
            for (const item of items) {
                if (filteredHashes.has(item.hash)) continue;
                if (!item.linkedBackHash) continue;
                const back = itemsMap.get(item.linkedBackHash);
                if (!back) continue;
                if (back.displayName.toLowerCase().includes(q)) extras.push(item);
            }
            result = sortUploadLibraryItems([...result, ...extras], sortBy, sortDir);
        }
        // Hide back faces that are linked (they are shown via the front face)
        result = result.filter((item) => {
            if (item.linkedFrontHash && !item.linkedBackHash) {
                const frontPartner = itemsMap.get(item.linkedFrontHash);
                if (frontPartner) return false;
            }
            return true;
        });
        return result;
    }, [filtered, query, items, itemsMap, sortBy, sortDir]);

    useEffect(() => {
        onDisplayItemsChange?.(displayItems);
    }, [displayItems, onDisplayItemsChange]);

    const effectiveTotalCount = useMemo(() => {
        return items.filter((item) => {
            if (item.linkedFrontHash && !item.linkedBackHash) {
                const frontPartner = itemsMap.get(item.linkedFrontHash);
                if (frontPartner) return false;
            }
            return true;
        }).length;
    }, [items, itemsMap]);

    const autoFlippedHashes = useMemo(() => {
        if (!query) return new Set<string>();
        const q = query.toLowerCase();
        const set = new Set<string>();
        for (const item of displayItems) {
            if (!item.linkedBackHash) continue;
            const frontMatches = item.displayName.toLowerCase().includes(q);
            if (frontMatches) continue;
            const back = itemsMap.get(item.linkedBackHash);
            if (back?.displayName.toLowerCase().includes(q)) set.add(item.hash);
        }
        return set;
    }, [query, displayItems, itemsMap]);

    const handleToggleFavorite = useCallback(
        async (hash: string) => {
            const item = itemsMap.get(hash);
            if (!item) return;
            const newFavoriteState = !item.isFavorite;
            await updateUploadLibraryMetadata(hash, { isFavorite: newFavoriteState });
            let partnerHash: string | undefined;
            if (item.linkedFrontHash) partnerHash = item.linkedFrontHash;
            else if (item.linkedBackHash) partnerHash = item.linkedBackHash;
            if (partnerHash) {
                await updateUploadLibraryMetadata(partnerHash, {
                    isFavorite: newFavoriteState,
                });
            }
            await onRefresh();
        },
        [itemsMap, onRefresh]
    );

    const handleRename = useCallback(
        async (hash: string, name: string) => {
            const trimmed = name.trim();
            if (!trimmed) {
                setEditingHash(null);
                return;
            }
            await updateUploadLibraryMetadata(hash, {
                displayName: trimmed,
                canonicalCardName: trimmed,
            });
            setEditingHash(null);
            await onRefresh();
        },
        [onRefresh]
    );

    const handleDelete = useCallback(
        async (hash: string) => {
            if (
                !window.confirm(
                    "Are you sure you want to delete this upload? This action cannot be undone."
                )
            )
                return;
            await deleteUploadLibraryItem(hash);
            await onRefresh();
            useToastStore.getState().showSuccessToast("Upload deleted");
        },
        [onRefresh]
    );

    const handleMatchCard = useCallback(
        async (hash: string, cardName: string) => {
            const trimmed = cardName.trim();
            if (!trimmed) return;
            const card = await getCardByName(trimmed);
            if (card) {
                const item = itemsMap.get(hash);
                const isLinkedDfc = item && (item.linkedFrontHash || item.linkedBackHash);
                const dfcParts = card.name.includes(' // ') ? card.name.split(' // ') : null;
                let faceName = card.name;
                if (isLinkedDfc && dfcParts) {
                    faceName = item.linkedFrontHash ? dfcParts[1].trim() : dfcParts[0].trim();
                }
                await updateUploadLibraryMetadata(hash, {
                    displayName: faceName,
                    canonicalCardName: card.name,
                    canonicalCardSet: card.set,
                    canonicalCardNumber: card.number,
                    typeLine: card.type_line,
                });
                if (isLinkedDfc && dfcParts) {
                    const partnerHash = item.linkedFrontHash || item.linkedBackHash;
                    const partnerFaceName = item.linkedFrontHash ? dfcParts[0].trim() : dfcParts[1].trim();
                    if (partnerHash) {
                        await updateUploadLibraryMetadata(partnerHash, {
                            displayName: partnerFaceName,
                            canonicalCardName: card.name,
                            canonicalCardSet: card.set,
                            canonicalCardNumber: card.number,
                            typeLine: card.type_line,
                        });
                    }
                }
                setMatchedCardResult(card);
                setMatchingQuery(card.name);
                await onRefresh();
                useToastStore.getState().showSuccessToast(`Identified as ${card.name}`);
            }
        },
        [onRefresh, itemsMap]
    );

    const handleUnmatch = useCallback(
        async (hash: string) => {
            await updateUploadLibraryMetadata(hash, {
                canonicalCardName: undefined,
                canonicalCardSet: undefined,
                canonicalCardNumber: undefined,
                typeLine: undefined,
            });
            await onRefresh();
        },
        [onRefresh]
    );

    const handleUnlink = useCallback(
        async (hash: string) => {
            await unlinkUploadFaces(hash);
            await onRefresh();
        },
        [onRefresh]
    );

    const toggleGroupCollapse = useCallback((groupName: string) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(groupName)) next.delete(groupName);
            else next.add(groupName);
            return next;
        });
    }, []);

    const handleToggleAllTypesCollapsed = useCallback(() => {
        setAllTypesCollapsed((prev) => {
            const newVal = !prev;
            if (newVal) {
                const groups = new Map<string, UploadLibraryItem[]>();
                for (const item of displayItems) {
                    const key = getUploadLibraryGroupKey(item, sortBy);
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key)!.push(item);
                }
                setCollapsedGroups(new Set(groups.keys()));
            } else {
                setCollapsedGroups(new Set());
            }
            return newVal;
        });
    }, [displayItems, sortBy]);

    const isGroupCollapsed = (groupName: string) => {
        if (allTypesCollapsed) return !collapsedGroups.has(groupName);
        return collapsedGroups.has(groupName);
    };

    const stripQuery = useCallback((url?: string) => url?.split("?")[0], []);

    const handleTileClick = useCallback(
        (
            upload: UploadLibraryItem,
            _displayItem: UploadLibraryItem,
            e: React.MouseEvent
        ) => {
            console.log(`[UploadLibraryGrid] handleTileClick: upload.hash=${upload.hash.substring(0, 8)}, upload.displayName=${upload.displayName}, mode=${mode}`);
            if (mode === "editor") {
                if ((e.ctrlKey || e.metaKey || e.shiftKey) && onToggleSelect) {
                    onToggleSelect(upload.hash, e.shiftKey);
                }
            } else if (onSelectItem) {
                console.log(`[UploadLibraryGrid] handleTileClick: calling onSelectItem with upload.hash=${upload.hash.substring(0, 8)}, upload.displayName=${upload.displayName}`);
                onSelectItem(upload);
            }
        },
        [mode, onToggleSelect, onSelectItem]
    );

    const handleToggleFlip = useCallback((hash: string) => {
        setFlippedHashes((prev) => {
            const next = new Set(prev);
            if (next.has(hash)) next.delete(hash);
            else next.add(hash);
            return next;
        });
    }, []);

    const handleStartIdentify = useCallback((hash: string, query: string) => {
        setMatchingHash(hash);
        setMatchingQuery(query);
        setEditingHash(null);
    }, []);

    const handleStartRename = useCallback((hash: string, name: string) => {
        setEditingHash(hash);
        setEditingName(name);
        setMatchingHash(null);
    }, []);

    const handleCloseIdentify = useCallback(() => {
        setMatchingHash(null);
        setMatchedCardResult(null);
    }, []);

    const renderTile = (upload: UploadLibraryItem) => {
        const isLinked = !!(upload.linkedFrontHash || upload.linkedBackHash);
        let tabBaseFlipped = false;
        if (mode === "artwork-modal" && selectedFace) {
            if (selectedFace === "front") {
                tabBaseFlipped = !!upload.linkedFrontHash; // If tile is back face, flip it to show front
            } else {
                tabBaseFlipped = !!upload.linkedBackHash; // If tile is front face, flip it to show back
            }
        }

        const isFlipped = mode === "artwork-modal"
            ? tabBaseFlipped !== flippedHashes.has(upload.hash)
            : flippedHashes.has(upload.hash) !== autoFlippedHashes.has(upload.hash);
        const backPartner =
            isLinked && upload.linkedBackHash
                ? itemsMap.get(upload.linkedBackHash)
                : undefined;
        const isArtSelected =
            mode === "artwork-modal" &&
            (selectedHash === upload.hash ||
                stripQuery(selectedHash) === stripQuery(upload.imageUrl) ||
                (backPartner &&
                    (selectedHash === backPartner.hash ||
                        stripQuery(selectedHash) === stripQuery(backPartner.imageUrl))));
        const displayImage =
            isFlipped && backPartner ? backPartner.imageUrl : upload.imageUrl;
        const displayName =
            isFlipped && backPartner ? backPartner.displayName : upload.displayName;
        const hasBleed = isFlipped
            ? backPartner?.hasBuiltInBleed
            : upload.hasBuiltInBleed;
        const displayItem = isFlipped && backPartner ? backPartner : upload;
        const isDisplaySelected =
            mode === "editor" && selectedHashes?.has(displayItem.hash);

        return (
            <div
                key={upload.hash}
                className="relative group cursor-pointer"
                data-testid="upload-library-item"
                onClick={(e) => handleTileClick(upload, displayItem, e)}
                onContextMenu={(e) => {
                    if (mode === "editor" && onContextMenu) {
                        e.preventDefault();
                        onContextMenu(e, displayItem.hash);
                    }
                }}
            >
                <div
                    className="relative w-full overflow-hidden"
                    style={{ aspectRatio: "63 / 88" }}
                >
                    {hasBleed ? (
                        <CardImageSvg
                            url={displayImage}
                            id={`upload-${upload.hash}`}
                            bleed={{
                                amountMm: 3.175,
                                sourceWidthMm: 69.35,
                                sourceHeightMm: 94.35,
                            }}
                            rounded={true}
                        />
                    ) : (
                        <img
                            src={displayImage}
                            alt={displayName}
                            className="w-full h-full object-cover rounded-[2.5mm]"
                        />
                    )}
                </div>
                {isDisplaySelected && (
                    <div className="absolute inset-0 bg-blue-500/30 pointer-events-none rounded-[2.5mm] border-4 border-blue-500" />
                )}
                {isArtSelected && (
                    <div className="absolute inset-0 rounded-[2.5mm] ring-4 ring-green-500 pointer-events-none" />
                )}
                {mode === "editor" && (
                    <div
                        className={`absolute left-1 top-1 w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer z-20 transition-opacity pointer-events-auto ${isDisplaySelected
                            ? "bg-blue-600 border-blue-600 opacity-100"
                            : (selectedHashes?.size ?? 0) > 0
                                ? "bg-white/80 border-gray-400 opacity-100"
                                : "bg-white/80 border-gray-400 opacity-0 group-hover:opacity-100"
                            }`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleSelect?.(displayItem.hash, e.shiftKey);
                        }}
                        title="Select"
                    >
                        {isDisplaySelected && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                )}
                {isLinked && backPartner && (
                    <TileFlipButton
                        uploadHash={upload.hash}
                        isFlipped={isFlipped}
                        onToggleFlip={handleToggleFlip}
                    />
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-2 rounded-b-[2.5mm] z-10">
                    {editingHash === displayItem.hash ? (
                        <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={() => handleRename(displayItem.hash, editingName)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter")
                                    handleRename(displayItem.hash, editingName);
                                if (e.key === "Escape") setEditingHash(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                            className="w-full text-xs bg-transparent text-white border-b border-white/50 focus:outline-none focus:border-white px-0 py-0"
                        />
                    ) : (
                        <>
                            <span className="text-xs text-white truncate block">
                                {displayName}
                            </span>
                            {displayItem.canonicalCardName &&
                                displayItem.canonicalCardName !== displayName && (
                                    <span className="text-[10px] text-white/60 truncate block">
                                        {displayItem.canonicalCardName}
                                    </span>
                                )}
                        </>
                    )}
                </div>
                <TileActionButtons
                    displayItem={displayItem}
                    isLinked={isLinked}
                    backPartner={backPartner}
                    mode={mode}
                    onFavorite={handleToggleFavorite}
                    onIdentify={handleStartIdentify}
                    onRename={handleStartRename}
                    onDelete={handleDelete}
                    onUnlink={handleUnlink}
                />
                {matchingHash === displayItem.hash && (
                    <TileIdentifyOverlay
                        displayItem={displayItem}
                        matchingQuery={matchingQuery}
                        matchedCardResult={matchedCardResult}
                        onMatchCard={handleMatchCard}
                        onUnmatch={handleUnmatch}
                        onClose={handleCloseIdentify}
                    />
                )}
            </div>
        );
    };

    const hasActiveFilters = typeFilters.length > 0 || favoritesOnly;

    const renderGrouped = () => {
        const groups = new Map<string, UploadLibraryItem[]>();
        for (const item of displayItems) {
            const key = getUploadLibraryGroupKey(item, sortBy);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(item);
        }
        const sortedGroups =
            sortBy === "name"
                ? Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
                : Array.from(groups.entries());
        return (
            <div className="flex flex-col gap-4">
                {sortedGroups.map(([groupName, groupItems]) => (
                    <div
                        key={groupName}
                        className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden"
                    >
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleGroupCollapse(groupName)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ")
                                    toggleGroupCollapse(groupName);
                            }}
                            className="w-full flex items-center justify-between px-4 py-3 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-900 transition-colors cursor-pointer"
                        >
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900 dark:text-white">
                                    {groupName}
                                </span>
                            </div>
                            <span className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                <span>
                                    {groupItems.length} item{groupItems.length !== 1 ? "s" : ""}
                                </span>
                                {isGroupCollapsed(groupName) ? (
                                    <ChevronRight className="w-4 h-4" />
                                ) : (
                                    <ChevronDown className="w-4 h-4" />
                                )}
                            </span>
                        </div>
                        {!isGroupCollapsed(groupName) && (
                            <div className="p-4">
                                <CardGrid cardSize={cardSize}>
                                    {groupItems.map(renderTile)}
                                </CardGrid>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-4 w-full">
            {!filtersCollapsed && (
                <UploadLibraryFilterBar
                    mode="upload-library"
                    uploads={items}
                    filteredUploads={displayItems}
                    sortBy={sortBy}
                    setSortBy={setSortBy}
                    sortDir={sortDir}
                    setSortDir={(dir) => {
                        setSortDir(dir);
                        useUserPreferencesStore
                            .getState()
                            .setUploadLibrarySortDirection(dir);
                    }}
                    typeFilter={typeFilters}
                    setTypeFilter={setTypeFilters}
                    showFavoritesOnly={favoritesOnly}
                    setShowFavoritesOnly={setFavoritesOnly}
                    totalCount={effectiveTotalCount}
                    filteredCount={displayItems.length}
                    groupByType={groupBy}
                    onToggleGroupByType={() => setGroupBy((g) => !g)}
                    allTypesCollapsed={allTypesCollapsed}
                    onToggleAllTypesCollapsed={handleToggleAllTypesCollapsed}
                />
            )}
            {displayItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-gray-400 dark:text-gray-500 py-12">
                    <p className="text-sm font-medium text-center mb-4">
                        {items.length === 0
                            ? "No uploads yet. Upload images to build your library."
                            : query && hasActiveFilters
                                ? `No uploads match "${query}" and your filters.`
                                : query
                                    ? `No uploads match "${query}".`
                                    : "No uploads match your filters."}
                    </p>
                    {hasActiveFilters && (
                        <button
                            onClick={() => {
                                setTypeFilters([]);
                                setFavoritesOnly(false);
                            }}
                            className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors mb-2"
                        >
                            Clear All Filters
                        </button>
                    )}
                </div>
            ) : groupBy ? (
                renderGrouped()
            ) : (
                <CardGrid cardSize={cardSize}>{displayItems.map(renderTile)}</CardGrid>
            )}
        </div>
    );
}
