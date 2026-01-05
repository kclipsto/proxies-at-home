import React, { useEffect, useState } from 'react';
import { Button } from 'flowbite-react';
import { Download, CheckCircle, AlertCircle, X } from 'lucide-react';
import { debugLog } from '@/helpers/debug';

export const UpdateNotification: React.FC = () => {
    const [status, setStatus] = useState<UpdateStatus | ''>('');
    const [info, setInfo] = useState<UpdateEventInfo>(null);
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!window.electronAPI) return;

        window.electronAPI.onUpdateStatus((newStatus: UpdateStatus, newInfo?: UpdateEventInfo) => {
            debugLog('Update Status:', newStatus, newInfo);
            setStatus(newStatus);
            setInfo(newInfo ?? null);

            if (['available', 'downloaded', 'error'].includes(newStatus)) {
                setShow(true);
            }
        });
    }, []);

    if (!show || !window.electronAPI) return null;

    const handleInstall = () => {
        window.electronAPI?.installUpdate();
    };

    const handleClose = () => {
        setShow(false);
    };

    // Determine styling based on status
    const getConfig = () => {
        switch (status) {
            case 'available':
                return {
                    bg: 'bg-blue-600',
                    icon: <Download className="h-4 w-4 shrink-0" />,
                    message: 'Update available! Downloading...',
                };
            case 'downloaded':
                return {
                    bg: 'bg-green-600',
                    icon: <CheckCircle className="h-4 w-4 shrink-0" />,
                    message: 'Update downloaded and ready to install.',
                };
            case 'error':
                return {
                    bg: 'bg-red-600',
                    icon: <AlertCircle className="h-4 w-4 shrink-0" />,
                    message: `Update failed: ${typeof info === 'string' ? info : 'Unknown error'}`,
                };
            default:
                return null;
        }
    };

    const config = getConfig();
    if (!config) return null;

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-200000 pointer-events-auto">
            <div className={`${config.bg} text-white px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-3 max-w-md`}>
                {config.icon}
                <span className="flex-1 overflow-hidden text-ellipsis">{config.message}</span>
                {status === 'downloaded' && (
                    <Button size="xs" color="light" onClick={handleInstall} className="shrink-0">
                        Restart & Install
                    </Button>
                )}
                <button
                    onClick={handleClose}
                    className="p-1 hover:bg-white/20 rounded transition-colors shrink-0"
                    aria-label="Dismiss"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
};
