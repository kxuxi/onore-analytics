export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false };

export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
}

export function isObject(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
