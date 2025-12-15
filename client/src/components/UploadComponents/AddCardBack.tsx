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
            color="gray"
            size="lg"
            onClick={handleAddCardBack}
            className="w-full"
        >
            Add Card Back
        </Button>
    );
}
