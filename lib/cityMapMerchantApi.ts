import { CityMapAccountMismatchError } from "./cityMapApi";
import type { MerchantSettings } from "./cityMapMerchants";
import { enqueueCityMapWrite, waitForCityMapWrites } from "./cityMapWriteQueue";
import {
  readJsonResponse,
  responseErrorMessage,
  throwIfResponseFailed,
} from "./httpClient";

export type MerchantSettingsResponse = { settings: MerchantSettings | null };

const endpoint = "/api/city-map/merchant-settings";

async function checkResponse(response: Response, fallback: string): Promise<void> {
  if (response.status === 409) {
    const body = await readJsonResponse<unknown>(response);
    throw new CityMapAccountMismatchError(responseErrorMessage(body, fallback));
  }
  await throwIfResponseFailed(response, fallback);
}

export async function fetchMerchantSettings(accountId: number): Promise<MerchantSettingsResponse> {
  await waitForCityMapWrites(accountId);
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: { "X-City-Map-Account-Id": String(accountId) },
  });
  await checkResponse(response, "行商予測の設定の取得に失敗しました");
  return response.json();
}

export function saveMerchantSettings(
  accountId: number,
  settings: MerchantSettings | null
): Promise<MerchantSettingsResponse> {
  // 呼び出し時点の年月を保持し、キュー待機中の変更に影響されないようにする。
  const body = JSON.stringify({ settings });
  return enqueueCityMapWrite(accountId, async () => {
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-City-Map-Account-Id": String(accountId),
      },
      cache: "no-store",
      body,
    });
    await checkResponse(response, "行商予測の設定の保存に失敗しました");
    return response.json() as Promise<MerchantSettingsResponse>;
  });
}
