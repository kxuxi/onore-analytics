import {
  readJsonResponse,
  responseErrorMessage,
  throwIfResponseFailed,
} from "./httpClient";
import { enqueueCityMapWrite, waitForCityMapWrites } from "./cityMapWriteQueue";

export type CityMapResponse = { source: string };

export class CityMapAccountMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CityMapAccountMismatchError";
  }
}

async function checkResponse(response: Response, fallback: string): Promise<void> {
  if (response.status === 409) {
    const body = await readJsonResponse<unknown>(response);
    throw new CityMapAccountMismatchError(responseErrorMessage(body, fallback));
  }
  await throwIfResponseFailed(response, fallback);
}

/** ログイン中のアカウントの都市地図を取得する。 */
export async function fetchCityMap(accountId: number): Promise<CityMapResponse> {
  await waitForCityMapWrites(accountId);
  const response = await fetch("/api/city-map", {
    cache: "no-store",
    headers: { "X-City-Map-Account-Id": String(accountId) },
  });
  await checkResponse(response, "都市地図の取得に失敗しました");
  return response.json();
}

/** 貼り付けた表をアカウントに保存する。空文字で地図を消去する。 */
export function saveCityMap(accountId: number, source: string): Promise<CityMapResponse> {
  return enqueueCityMapWrite(accountId, async () => {
    const response = await fetch("/api/city-map", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-City-Map-Account-Id": String(accountId),
      },
      cache: "no-store",
      body: JSON.stringify({ source }),
    });
    await checkResponse(response, "都市地図の保存に失敗しました");
    return response.json() as Promise<CityMapResponse>;
  });
}
