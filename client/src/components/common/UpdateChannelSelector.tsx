import { useEffect, useState } from 'react';
import { Checkbox, Label } from 'flowbite-react';
import { ToggleButtonGroup, AutoTooltip } from './index';
import { HelpCircle } from 'lucide-react';

/**
 * Update channel selector for Electron app.
 * Only renders when running in Electron (window.electronAPI exists).
 * Allows users to switch between stable and latest update channels,
 * and to enable/disable automatic update checks.
 */
export function UpdateChannelSelector() {
    const [channel, setChannel] = useState<string>('latest');
    const [version, setVersion] = useState<string>('');
    const [isElectron, setIsElectron] = useState(false);
    const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);

    // Check for Electron on mount
    useEffect(() => {
        const hasElectronAPI = typeof window !== 'undefined' &&
            window.electronAPI !== undefined &&
            typeof window.electronAPI.getUpdateChannel === 'function';

        setIsElectron(hasElectronAPI);

        if (!hasElectronAPI) return;

        const fetchInfo = async () => {
            try {
                const [currentChannel, currentVersion, autoEnabled] = await Promise.all([
                    window.electronAPI!.getUpdateChannel(),
                    window.electronAPI!.getAppVersion(),
                    window.electronAPI!.getAutoUpdateEnabled(),
                ]);
                setChannel(currentChannel);
                setVersion(currentVersion);
                setAutoUpdateEnabled(autoEnabled);
            } catch (e) {
                console.error('Failed to get update info:', e);
            }
        };
        fetchInfo();
    }, []);

    const handleChannelChange = async (newChannel: string) => {
        if (newChannel === channel || !isElectron) return;

        try {
            const success = await window.electronAPI!.setUpdateChannel(newChannel);
            if (success) {
                setChannel(newChannel);
                // Trigger update check with new channel
                await window.electronAPI!.checkForUpdates();
            }
        } catch (e) {
            console.error('Failed to set update channel:', e);
        }
    };

    const handleAutoUpdateChange = async (enabled: boolean) => {
        if (!isElectron) return;

        try {
            await window.electronAPI!.setAutoUpdateEnabled(enabled);
            setAutoUpdateEnabled(enabled);
        } catch (e) {
            console.error('Failed to set auto-update enabled:', e);
        }
    };

    // Only render in Electron
    if (!isElectron) {
        return null;
    }

    const channelOptions = [
        { id: 'latest', label: 'Latest', highlightColor: '#2563eb' }, // blue-600 (default)
        { id: 'stable', label: 'Stable', highlightColor: '#16a34a' }, // green-600 (fallback)
    ];

    const tooltipContent = channel === 'stable'
        ? 'You will only receive major releases (most stable).'
        : 'You will receive all updates as they are released.';

    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <Label>Update Channel</Label>
                    <AutoTooltip content={tooltipContent} placement="top">
                        <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 cursor-pointer" />
                    </AutoTooltip>
                </div>
                <ToggleButtonGroup
                    options={channelOptions}
                    value={channel}
                    onChange={handleChannelChange}
                />
            </div>

            <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 -ml-2">
                <Checkbox
                    id="auto-update-enabled"
                    checked={autoUpdateEnabled}
                    onChange={(e) => handleAutoUpdateChange(e.target.checked)}
                />
                <Label htmlFor="auto-update-enabled" className="flex-1 cursor-pointer">
                    Check for updates automatically
                </Label>
            </div>

            <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                    App Version
                </span>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    v{version}
                </span>
            </div>
        </div>
    );
}

