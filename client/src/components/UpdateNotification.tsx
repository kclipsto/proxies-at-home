import React, { useEffect, useState } from 'react';
import { Toast, Button } from 'flowbite-react';
import { HiDownload, HiExclamation, HiCheck } from 'react-icons/hi';

export const UpdateNotification: React.FC = () => {
    const [status, setStatus] = useState<UpdateStatus | ''>('');
    const [info, setInfo] = useState<UpdateEventInfo>(null);
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!window.electronAPI) return;

        window.electronAPI.onUpdateStatus((newStatus: UpdateStatus, newInfo?: UpdateEventInfo) => {
            console.log('Update Status:', newStatus, newInfo);
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

    const CloseButton = () => (
        <button onClick={handleClose} className="ml-auto -mx-1.5 -my-1.5 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-900 focus:ring-2 focus:ring-gray-300 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-white dark:focus:ring-gray-700">
            <span className="sr-only">Close</span>
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
        </button>
    );

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
            {status === 'available' && (
                <Toast>
                    <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-500 dark:bg-blue-800 dark:text-blue-200">
                        <HiDownload className="h-5 w-5" />
                    </div>
                    <div className="ml-3 text-sm font-normal">
                        Update available! Downloading...
                    </div>
                    <CloseButton />
                </Toast>
            )}

            {status === 'downloaded' && (
                <Toast>
                    <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-500 dark:bg-green-800 dark:text-green-200">
                        <HiCheck className="h-5 w-5" />
                    </div>
                    <div className="ml-3 text-sm font-normal">
                        Update downloaded.
                        <Button size="xs" color="success" onClick={handleInstall} className="mt-2">
                            Restart &amp; Install
                        </Button>
                    </div>
                    <CloseButton />
                </Toast>
            )}

            {status === 'error' && (
                <Toast>
                    <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-500 dark:bg-red-800 dark:text-red-200">
                        <HiExclamation className="h-5 w-5" />
                    </div>
                    <div className="ml-3 text-sm font-normal">
                        Update failed: {typeof info === 'string' ? info : 'Unknown error'}
                    </div>
                    <CloseButton />
                </Toast>
            )}
        </div>
    );
};
