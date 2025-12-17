import React from 'react';

export interface TabItem<T extends string = string> {
    id: T;
    label: string;
    icon?: React.ReactNode;
}

export interface TabBarProps<T extends string = string> {
    tabs: TabItem<T>[];
    activeTab: T;
    onTabChange: (tab: T) => void;
    /** Primary style for main navigation (larger, border-bottom) */
    variant?: 'primary' | 'secondary';
    className?: string;
}

/**
 * Reusable tab bar component with primary and secondary variants.
 * Primary: Larger tabs with bottom border indicator (for main navigation)
 * Secondary: Smaller tabs with active background (for sub-navigation)
 */
export function TabBar<T extends string = string>({
    tabs,
    activeTab,
    onTabChange,
    variant = 'primary',
    className = '',
}: TabBarProps<T>) {
    const isPrimary = variant === 'primary';

    return (
        <div className={`flex border-b border-gray-200 dark:border-gray-600 ${isPrimary ? 'bg-white dark:bg-gray-700' : 'bg-gray-50 dark:bg-gray-800'} ${className}`}>
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;

                const baseClasses = 'flex items-center gap-2 font-medium transition-colors';
                const sizeClasses = isPrimary
                    ? 'px-6 py-3'
                    : 'px-4 py-2 text-sm';

                const activeClasses = isPrimary
                    ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 border-x border-t border-gray-200 dark:border-gray-600 rounded-t-lg -mb-px';

                const inactiveClasses = isPrimary
                    ? 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200';

                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onTabChange(tab.id)}
                        className={`${baseClasses} ${sizeClasses} ${isActive ? activeClasses : inactiveClasses} ${isPrimary ? 'truncate max-w-[250px]' : ''}`}
                        title={isPrimary ? tab.label : undefined}
                        aria-label={`${tab.label} Tab`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}
