export async function readJsonResponse<T>(
  response: Response
): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function responseErrorMessage(
  body: unknown,
  fallbackMessage: string
): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    body.error != null
  ) {
    return String(body.error);
  }
  return fallbackMessage;
}

export async function throwIfResponseFailed(
  response: Response,
  fallbackMessage: string
): Promise<void> {
  if (response.ok) return;
  const body = await readJsonResponse<unknown>(response);
  throw new Error(responseErrorMessage(body, fallbackMessage));
}
