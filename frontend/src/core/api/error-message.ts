function structuredDetailMessage(message: string): string | null {
  const start = message.indexOf("{");
  if (start < 0) return null;
  try {
    const payload = JSON.parse(message.slice(start));
    const detail = payload?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (typeof detail?.message === "string" && detail.message.trim()) {
      return detail.message;
    }
  } catch {
    // The transport message is not a JSON-bearing HTTP error.
  }
  return null;
}

export function getErrorDisplayMessage(
  error: unknown,
  fallback = "Request failed.",
): string {
  let message: string | undefined;
  if (typeof error === "string") {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "object" && error !== null) {
    const direct = Reflect.get(error, "message");
    const nested = Reflect.get(error, "error");
    if (typeof direct === "string") message = direct;
    else if (nested instanceof Error) message = nested.message;
    else if (typeof nested === "string") message = nested;
  }
  if (!message?.trim()) return fallback;
  return structuredDetailMessage(message) ?? message;
}
