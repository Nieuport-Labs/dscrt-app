/**
 * Letting somebody else pay your gas.
 *
 * `x/feegrant` is a module of the chain, not of this protocol: an account grants another
 * account an allowance that can be spent on transaction fees and **on nothing else** — it
 * can never move the granter's funds. So a grant is a strictly weaker thing to hold than a
 * balance, which is what makes it safe to accept from a stranger and safe to offer to one.
 *
 * The keeper has run on exactly this since the start — see the `dscrt-keeper` README — and
 * the reasoning carries over unchanged to a person staking from a browser. A first-time
 * user arrives holding SCRT they want to stake and no SCRT to pay for staking it, which is
 * a genuinely awkward first minute; under a grant, somebody else has already covered it.
 *
 * What is here is the choosing, not the granting. This app never *makes* a grant: that is
 * a decision about the granter's money, and it belongs in their own wallet or in the
 * dashboard at https://github.com/jirkacepelka/fee-granter, not behind a button on a
 * staking screen. All the app does is notice a grant already exists and spend it.
 *
 * The reading half comes from `feegrant-sdk.ts`, vendored from that same project. This
 * file is the part that is about *this* app: which message types it sends, where the
 * user's preference is kept, and what happens when the lookup fails.
 */

import { DENOM } from "./chain";
import { lcdUrl } from "./endpoint";
import {
  estimateFee,
  fetchFeeGrants,
  selectFeeGrant,
  type FeeGrant,
  type SelectionMode,
} from "./feegrant-sdk";

export type { FeeGrant, SelectionMode };
export { availableFee, checkUsable, selectFeeGrant } from "./feegrant-sdk";

/**
 * The only message this app ever sends.
 *
 * Every write here is a contract call — deposit, unbond, claim, upkeep, every manager
 * action — so one type covers all of them. It matters because a narrow grant is the good
 * kind: `AllowedMsgAllowance` restricted to this type cannot be drained by a `MsgSend`,
 * and a grant restricted to something else must be ruled out *before* a wallet asks the
 * user to sign a transaction the chain is going to reject.
 *
 * Secret's compute module, not CosmWasm's — `/cosmwasm.wasm.v1.MsgExecuteContract` is a
 * different string and the chain does not accept it.
 */
export const EXECUTE_MSG_TYPE = "/secret.compute.v1beta1.MsgExecuteContract";

// ---- the user's preference ----

const MODE_KEY = "secret-lst.feegrant.mode";
const GRANTER_KEY = "secret-lst.feegrant.granter";

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private browsing, or storage disabled. The default is the sensible one anyway.
    return null;
  }
}

function write(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Nothing to do: the choice simply will not survive a reload.
  }
}

export interface FeeGrantPreference {
  mode: SelectionMode;
  /** Only meaningful when the mode is `select`. */
  granter: string | null;
}

/**
 * How to pay for the next transaction.
 *
 * `auto` by default, which spends a grant whenever one covers the fee. That is the
 * SDK's default too, and it is the right one: a grant exists because somebody decided it
 * should be spent, so preferring the user's own balance over it would be a courtesy
 * nobody asked for. Nothing is spent that was not already earmarked for fees, and the
 * setting is one click from `off` for anyone who would rather pay their own way.
 */
export function preference(): FeeGrantPreference {
  const stored = read(MODE_KEY);
  const mode: SelectionMode =
    stored === "off" || stored === "select" || stored === "auto" ? stored : "auto";
  return { mode, granter: read(GRANTER_KEY) };
}

export function setPreference(mode: SelectionMode, granter?: string | null) {
  write(MODE_KEY, mode === "auto" ? null : mode);
  // Kept even when the mode moves away from `select`, so switching to `off` and back does
  // not silently lose which granter was picked.
  if (granter !== undefined) write(GRANTER_KEY, granter);
}

// ---- reading the chain ----

/** Every grant this address may spend, as the current node reports them. */
export function loadFeeGrants(grantee: string): Promise<FeeGrant[]> {
  return fetchFeeGrants(lcdUrl(), grantee, { denom: DENOM });
}

/**
 * Who should pay for a transaction of this size — an address for `feeGranter`, or nothing.
 *
 * Asked fresh every time rather than cached with the grants shown in settings. A grant can
 * be revoked between opening a panel and pressing a button, and a revoked grant does not
 * degrade: the transaction fails outright, after the wallet has already asked for a
 * signature. One extra LCD read is a cheap way not to spend somebody's afternoon on that.
 *
 * **It never throws, and never rejects a transaction.** Every failure here — an
 * unreachable node, a malformed allowance, a preferred granter that stopped granting —
 * resolves to `undefined`, which means the user pays their own fee, which is what would
 * have happened had the feature not existed. A fee grant is an optimisation; an
 * optimisation that can break staking is not worth having.
 */
export async function chooseFeeGranter(
  grantee: string | null | undefined,
  gasLimit: number,
  gasPrice: number,
): Promise<string | undefined> {
  if (!grantee) return undefined;

  const { mode, granter } = preference();
  if (mode === "off") return undefined;
  if (mode === "select" && !granter) return undefined;

  try {
    const grants = await loadFeeGrants(grantee);
    if (grants.length === 0) return undefined;

    const choice = selectFeeGrant(grants, {
      mode,
      granter: granter ?? undefined,
      fee: estimateFee(gasLimit, gasPrice),
      msgTypeUrls: [EXECUTE_MSG_TYPE],
    });
    return choice.granter;
  } catch {
    return undefined;
  }
}

// ---- describing one, for the panel ----

/** "every 24 h", or nothing for a grant that does not refill. */
export function periodLabel(grant: FeeGrant): string | null {
  if (grant.kind !== "periodic" || !grant.periodSeconds) return null;
  const seconds = grant.periodSeconds;
  if (seconds % 86_400 === 0) {
    const days = seconds / 86_400;
    return `every ${days} day${days === 1 ? "" : "s"}`;
  }
  if (seconds % 3_600 === 0) return `every ${seconds / 3_600} h`;
  return `every ${Math.max(1, Math.round(seconds / 60))} min`;
}
