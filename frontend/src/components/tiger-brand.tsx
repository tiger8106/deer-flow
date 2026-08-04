import Image from "next/image";

import { cn } from "@/lib/utils";

export function TigerBrand({
  className,
  iconClassName,
  nameClassName,
  showName = true,
}: {
  className?: string;
  iconClassName?: string;
  nameClassName?: string;
  showName?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Image
        aria-hidden
        src="/images/tiger-logo.png"
        alt=""
        width={1013}
        height={929}
        priority
        className={cn("size-9 object-contain", iconClassName)}
      />
      {showName && (
        <span className={cn("font-serif", nameClassName)}>Tiger</span>
      )}
    </div>
  );
}
