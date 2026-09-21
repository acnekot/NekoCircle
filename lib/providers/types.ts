import type { InteractionEvent } from "@/types/interaction";

export interface InteractionProvider {
  name: string;
  fetchInteractions(screenName: string): Promise<InteractionEvent[]>;
}

export type ProviderFetchOutcome = {
  name: string;
  status: "ok" | "failed";
  events: InteractionEvent[];
  error?: string;
};

/** Provider 失败时保留其他来源的数据，不让整次生成失败。 */
export async function fetchProvidersSafely(
  providers: readonly InteractionProvider[],
  screenName: string,
): Promise<ProviderFetchOutcome[]> {
  const settled = await Promise.allSettled(
    providers.map((provider) => provider.fetchInteractions(screenName)),
  );
  return settled.map((result, index) => {
    const name = providers[index]?.name ?? `provider-${index}`;
    return result.status === "fulfilled"
      ? { name, status: "ok", events: result.value }
      : {
          name,
          status: "failed",
          events: [],
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        };
  });
}
