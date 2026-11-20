import { LoaderIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  loadDocumentPreview,
  PDF_VIEWER_URL,
} from "@/core/artifacts/document-preview";
import { useI18n } from "@/core/i18n/hooks";

export function DocumentPreview({
  filepath,
  threadId,
}: {
  filepath: string;
  threadId: string;
}) {
  const { locale } = useI18n();
  const chinese = locale === "zh-CN";
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let objectUrl: string | undefined;
    setUrl(undefined);
    setFailed(false);
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    void loadDocumentPreview({ filepath, threadId, signal: controller.signal })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [filepath, threadId, attempt]);

  if (failed) {
    return (
      <div
        className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center"
        role="status"
      >
        <p>
          {chinese
            ? "预览暂不可用，可下载原文件查看。"
            : "Preview unavailable. You can download the original file."}
        </p>
        <Button
          variant="outline"
          onClick={() => setAttempt((value) => value + 1)}
        >
          {chinese ? "重试" : "Retry"}
        </Button>
      </div>
    );
  }
  if (!url) {
    return (
      <div
        className="flex size-full items-center justify-center gap-2"
        role="status"
      >
        <LoaderIcon className="size-4 animate-spin" />
        {chinese ? "正在加载预览…" : "Loading preview…"}
      </div>
    );
  }
  return (
    <iframe
      className="block size-full border-0"
      data-pdf-source={url}
      src={PDF_VIEWER_URL}
      title={filepath.split("/").pop()}
    />
  );
}
