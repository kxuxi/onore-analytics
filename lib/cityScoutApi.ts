import { CityMapAccountMismatchError } from "./cityMapApi";
import type { CityScoutReport } from "./cityScout";
import { enqueueCityMapWrite, waitForCityMapWrites } from "./cityMapWriteQueue";
import {
  readJsonResponse,
  responseErrorMessage,
  throwIfResponseFailed,
} from "./httpClient";

export type CityScoutsResponse = { reports: CityScoutReport[] };
export type SaveCityScoutsResponse = CityScoutsResponse & {
  savedCityNames: string[];
  skippedCityNames: string[];
};

const endpoint = "/api/city-map/scouts";

async function checkResponse(response: Response, fallback: string): Promise<void> {
  if (response.status === 409) {
    const body = await readJsonResponse<unknown>(response);
    throw new CityMapAccountMismatchError(responseErrorMessage(body, fallback));
  }
  await throwIfResponseFailed(response, fallback);
}

export async function fetchCityScouts(accountId: number): Promise<CityScoutsResponse> {
  await waitForCityMapWrites(accountId);
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: { "X-City-Map-Account-Id": String(accountId) },
  });
  await checkResponse(response, "偵察結果の取得に失敗しました");
  return response.json();
}

export function saveCityScouts(accountId: number, source: string): Promise<SaveCityScoutsResponse> {
  const body = JSON.stringify({ source });
  return enqueueCityMapWrite(accountId, async () => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-City-Map-Account-Id": String(accountId),
      },
      cache: "no-store",
      body,
    });
    await checkResponse(response, "偵察結果の保存に失敗しました");
    return response.json() as Promise<SaveCityScoutsResponse>;
  });
}
