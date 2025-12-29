/**
 * KeyboardShortcutsModal - Displays keyboard shortcuts help
 */
import { useEffect } from 'react';
import { Modal, ModalHeader, ModalBody } from 'flowbite-react';
import { useKeyboardShortcutsStore } from '../../store/keyboardShortcuts';
import { Keyboard } from 'lucide-react';

interface Shortcut {
    keys: string[];
    description: string;
}

const shortcuts: Shortcut[] = [
    { keys: ['Ctrl', 'Z'], description: 'Undo' },
    { keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo' },
    { keys: ['Ctrl', 'A'], description: 'Select All Cards' },
    { keys: ['Ctrl', 'C'], description: 'Copy Selected Card Names' },
    { keys: ['Ctrl', 'X'], description: 'Cut Selected Cards (Copy + Delete)' },
    { keys: ['Ctrl', 'D'], description: 'Duplicate Selected Cards' },
    { keys: ['Ctrl', 'Delete'], description: 'Delete Selected Cards' },
    { keys: ['Ctrl', '/'], description: 'Show Keyboard Shortcuts' },
    { keys: ['Ctrl', '\\'], description: 'Show Keyboard Shortcuts (alt)' },
    { keys: ['Esc'], description: 'Clear Selection' },
    { keys: ['F'], description: 'Flip Selected Cards' },
    { keys: ['Click'], description: 'Select Card' },
    { keys: ['Ctrl', 'Click'], description: 'Toggle Card Selection' },
    { keys: ['Shift', 'Click'], description: 'Select Range' },
];

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
    return (
        <div className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-700 last:border-0">
            <span className="text-gray-700 dark:text-gray-300">{shortcut.description}</span>
            <div className="flex gap-1">
                {shortcut.keys.map((key, i) => (
                    <span key={i}>
                        <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500">
                            {key}
                        </kbd>
                        {i < shortcut.keys.length - 1 && <span className="mx-1 text-gray-400">+</span>}
                    </span>
                ))}
            </div>
        </div>
    );
}

export function KeyboardShortcutsModal() {
    const isOpen = useKeyboardShortcutsStore((state) => state.isOpen);
    const closeModal = useKeyboardShortcutsStore((state) => state.closeModal);

    // Handle keyboard shortcuts to close modal
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Close on Escape only
            if (e.key === 'Escape') {
                e.preventDefault();
                closeModal();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, closeModal]);

    return (
        <Modal show={isOpen} onClose={closeModal} size="md">
            <ModalHeader>
                <div className="flex items-center gap-2">
                    <Keyboard className="size-5" />
                    Keyboard Shortcuts
                </div>
            </ModalHeader>
            <ModalBody>
                <div className="flex flex-col">
                    {shortcuts.map((shortcut, i) => (
                        <ShortcutRow key={i} shortcut={shortcut} />
                    ))}
                </div>
                <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                    On macOS, use ⌘ Cmd instead of Ctrl
                </p>
            </ModalBody>
        </Modal>
    );
}
