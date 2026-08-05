import { XIcon } from "lucide-react";

import { DialogClose } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function FullscreenDialogCloseButton({
  className,
}: {
  className?: string;
}) {
  return (
    <DialogClose
      aria-label="关闭"
      className={cn(
        "bg-background/95 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring absolute top-5 right-5 z-20 grid size-11 place-items-center rounded-full border shadow-sm transition-all hover:shadow-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        className,
      )}
    >
      <XIcon className="size-5" />
      <span className="sr-only">关闭</span>
    </DialogClose>
  );
}
