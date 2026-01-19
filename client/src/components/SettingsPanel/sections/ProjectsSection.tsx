import { ProjectSelector } from "@/components/ProjectSelector";
import { Label } from "flowbite-react";
import { AutoTooltip } from "@/components/common";
import { Info } from "lucide-react";

export function ProjectsSection() {
    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <Label>Current Project</Label>
                    <AutoTooltip content="Switch between different decks/projects. Each project has its own cards and settings.">
                        <Info className="w-4 h-4 text-gray-500 cursor-help" />
                    </AutoTooltip>
                </div>
                <div className="w-full">
                    <ProjectSelector />
                </div>
            </div>
        </div>
    );
}
