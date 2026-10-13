import { CityMapAccountMismatchError } from "./cityMapApi";
import { enqueueCityMapWrite } from "./cityMapWriteQueue";
import {
  readJsonResponse,
  responseErrorMessage,
  throwIfResponseFailed,
} from "./httpClient";

/** 保存中の処理を終えてから、アカウントの都市地図関連データをリセットする。 */
export function resetCityMapData(accountId: number): Promise<void> {
  return enqueueCityMapWrite(accountId, async () => {
    const fallback = "都市地図のデータリセットに失敗しました";
    const response = await fetch("/api/city-map/reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-City-Map-Account-Id": String(accountId),
      },
      cache: "no-store",
      body: JSON.stringify({}),
    });
    if (response.status === 409) {
      const body = await readJsonResponse<unknown>(response);
      throw new CityMapAccountMismatchError(responseErrorMessage(body, fallback));
    }
    await throwIfResponseFailed(response, fallback);
    const body = await readJsonResponse<{ ok?: unknown }>(response);
    if (body?.ok !== true) throw new Error(fallback);
  });
}
