

type Props = {
    suggestions: string[];
    hoveredIndex: number | null;
    setHoveredIndex: (index: number) => void;
    onClose: () => void;
};

export function SearchResultsList({
    suggestions,
    hoveredIndex,
    setHoveredIndex,
    onClose,
}: Props) {
    return (
        <div
            className="absolute inset-y-0 left-0 w-full sm:w-1/3 sm:left-1/2 sm:-translate-x-1/2 bg-white dark:bg-gray-800 z-20 flex flex-col sm:border-x sm:border-gray-200 dark:sm:border-gray-700 shadow-2xl"
        >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 shrink-0">
                <h4 className="font-medium text-gray-700 dark:text-gray-200">
                    {suggestions.length} Results
                </h4>
                <button
                    onClick={onClose}
                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                    Close List
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
                {suggestions.length > 0 ? (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                        {suggestions.map((suggestion, index) => (
                            <li
                                key={index}
                                id={`result-item-${index}`}
                                onClick={() => {
                                    setHoveredIndex(index);
                                    onClose();
                                }}
                                className={`p-3 rounded-lg cursor-pointer transition-colors flex items-center justify-between ${hoveredIndex === index
                                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                                    : "hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200"
                                    }`}
                            >
                                <span>{suggestion}</span>
                                {hoveredIndex === index && (
                                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                        <p>No results found</p>
                    </div>
                )}
            </div>
        </div>
    );
}
