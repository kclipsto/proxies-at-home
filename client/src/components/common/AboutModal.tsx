import { useEffect, useState } from 'react';
import { Modal, ModalHeader, ModalBody } from 'flowbite-react';
import { ExternalLink, Coffee } from 'lucide-react';
import { Button } from 'flowbite-react';
import { logoSvg as logo } from "@/assets";

interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
    const [version, setVersion] = useState<string>('');
    const [channel, setChannel] = useState<string>('');

    const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

    useEffect(() => {
        if (!isElectron || !isOpen) return;

        const fetchInfo = async () => {
            try {
                const [v, c] = await Promise.all([
                    window.electronAPI!.getAppVersion(),
                    window.electronAPI!.getUpdateChannel(),
                ]);
                setVersion(v);
                setChannel(c);
            } catch (e) {
                console.error('Failed to get app info:', e);
            }
        };
        fetchInfo();
    }, [isElectron, isOpen]);

    const openExternal = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    return (
        <Modal show={isOpen} onClose={onClose} size="md" dismissible>
            <ModalHeader>About Proxxied</ModalHeader>
            <ModalBody>
                <div className="space-y-4">
                    {/* Logo and Description */}
                    <div className="text-center">
                        <img
                            src={logo}
                            alt="Proxxied"
                            className="h-16 mx-auto mb-3"
                        />
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Create high-quality MTG proxy cards. Import decklists,
                            customize artwork, and generate print-ready PDFs.
                        </p>
                    </div>

                    {/* Version Info */}
                    {isElectron && (
                        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600 dark:text-gray-400">Version</span>
                                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                    v{version}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600 dark:text-gray-400">Update Channel</span>
                                <span className={`text-sm font-medium ${channel === 'stable' ? 'text-green-600' : 'text-blue-600'}`}>
                                    {channel === 'stable' ? 'Stable' : 'Latest'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Links */}
                    <div className="flex flex-col gap-2">
                        <Button
                            onClick={() => openExternal('https://github.com/kclipsto/proxies-at-home')}
                            className="w-full bg-[#0d1117] hover:bg-[#010409] dark:bg-[#0d1117] dark:hover:bg-[#010409]"
                        >
                            <svg className="mr-2 h-5 w-5" role="img" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                            </svg>
                            View on GitHub
                        </Button>
                        <Button
                            color="blue"
                            onClick={() => openExternal('https://proxxied.com')}
                            className="w-full"
                        >
                            <ExternalLink className="mr-2 h-5 w-5" />
                            Visit Website
                        </Button>
                        <Button
                            className="w-full bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-500 dark:hover:bg-yellow-600"
                            onClick={() => openExternal('https://buymeacoffee.com/kaiserclipston')}
                        >
                            <Coffee className="mr-2 h-5 w-5" />
                            Buy Me a Coffee
                        </Button>
                    </div>

                    {/* Credits */}
                    <div className="text-center text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <p>Made with ❤️ by the Proxxied community</p>
                        <p className="mt-1">© {new Date().getFullYear()} Proxxied. Not affiliated with Wizards of the Coast.</p>
                    </div>
                </div>
            </ModalBody>
        </Modal>
    );
}

