import { Button } from "flowbite-react";
import { addCustomImage } from "@/helpers/dbUtils";
import { undoableAddCards } from "@/helpers/undoableActions";
import { useLoadingStore } from "@/store/loading";
import cardBack from "@/assets/cardBack.png";

type Props = {
    onUploadComplete?: () => void;
};

export function AddCardBack({ onUploadComplete }: Props) {
    const setLoadingTask = useLoadingStore((state) => state.setLoadingTask);

    const handleAddCardBack = async () => {
        setLoadingTask("Uploading Images");
        try {
            const response = await fetch(cardBack);
            const blob = await response.blob();
            const imageId = await addCustomImage(blob, "-std");
            await undoableAddCards([{
                name: "Card Back",
                imageId: imageId,
                isUserUpload: true,
            }]);
            onUploadComplete?.();
        } finally {
            setLoadingTask(null);
        }
    };

    return (
        <Button
            size="lg"
            onClick={handleAddCardBack}
            className="w-full hover:bg-gray-400 bg-gray-300 
            text-black dark:bg-gray-600 dark:text-white focus:ring-gray-600 
            dark:focus:ring-gray-400 dark:hover:bg-gray-500"
        >
            Add Card Back
        </Button>
    );
}
