import type { Client } from "../generated/client";
import {
  getCurrentUserOptions,
  listSessionsOptions,
  listLedgersOptions,
} from "../generated/@tanstack/react-query.gen";

/** Only safe account metadata enters Query; auth is resolved inside the client. */
export function accountQueries(
  client: Client,
  scope: { instanceId: string; userId: string; generation: number },
) {
  const tags = [scope.instanceId, scope.userId, String(scope.generation)];
  const currentUser = getCurrentUserOptions({ client });
  const sessions = listSessionsOptions({ client });
  const ledgers = listLedgersOptions({ client });
  currentUser.queryKey[0].tags = tags;
  sessions.queryKey[0].tags = tags;
  ledgers.queryKey[0].tags = tags;
  const retry = (count: number, error: { code?: string }) =>
    count < 2 && ["unavailable", "rate-limited"].includes(error.code ?? "");
  return {
    currentUser: { ...currentUser, retry },
    sessions: { ...sessions, retry },
    ledgers: { ...ledgers, retry },
  };
}
