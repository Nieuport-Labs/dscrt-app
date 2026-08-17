/**
 * Wallet connection, contract queries, and the app-wide permit.
 *
 * Everything here runs in the browser. There is no server: reads are contract queries and
 * writes are signed in the user's wallet, which is what lets the whole app be a static
 * export that anyone can host.
 */

import { SecretNetworkClient, type Permit } from "secretjs";

import { lcdUrl } from "./endpoint";

export interface Deployment {
  chainId: string;
  lcdUrl: string;
  core: { address: string };
  token: { address: string };
}

/**
 * Treat an empty variable as an absent one.
 *
 * `??` is not enough here. Next inlines `process.env.NEXT_PUBLIC_X` textually into a static
 * export, so a variable that exists but is set to nothing arrives as `""` — which `??`
 * happily accepts, skipping the default and leaving an empty address behind. That is the
 * same class of mistake the `CONFIGURED` comment below describes, reaching the build
 * through a different door.
 */
function env(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value.trim() : fallback;
}

/**
 * Where dSCRT lives.
 *
 * Hardcoded rather than required as configuration, because this app serves one protocol and
 * a clone of it should work with no setup at all. The variables remain as overrides, for a
 * fork pointed at a devnet or, eventually, at mainnet.
 *
 * The code hashes are deliberately *not* here — see `codeHashes()`.
 */
export const DEPLOYMENT: Deployment = {
  chainId: env(process.env.NEXT_PUBLIC_CHAIN_ID, "pulsar-3"),
  lcdUrl: env(process.env.NEXT_PUBLIC_LCD_URL, "https://pulsar.lcd.secretnodes.com"),
  core: {
    address: env(
      process.env.NEXT_PUBLIC_CORE_ADDRESS,
      "secret1lj23n74aan7nlgj6hfm45fh3gc7h2ctdplsw8y",
    ),
  },
  token: {
    address: env(
      process.env.NEXT_PUBLIC_TOKEN_ADDRESS,
      "secret1hvt29j32a9k839n057p9qr75mgake8y9yjurq3",
    ),
  },
};

/** A pinned code hash, if the build asked for one. Empty means "ask the chain". */
const PINNED = {
  core: env(process.env.NEXT_PUBLIC_CORE_CODE_HASH, ""),
  token: env(process.env.NEXT_PUBLIC_TOKEN_CODE_HASH, ""),
};

/**
 * Whether the build actually knows which deployment it is pointing at.
 *
 * With the variables missing, the addresses are empty strings and every query goes to
 * `/compute/v1beta1/query/` — which serves the app's own HTML back, so the first thing a
 * user sees is `Unexpected token '<'`. That is a deployment mistake wearing the costume of
 * a chain error, and it cost a round of debugging on a live Vercel build, so the app says
 * plainly what is missing instead.
 *
 * For a stock build this is now always true, because the defaults above are real. It fires
 * only when somebody has overridden part of the deployment and left the rest — which is
 * exactly the case it was written for.
 */
export const CONFIGURED = Boolean(
  DEPLOYMENT.lcdUrl && DEPLOYMENT.core.address && DEPLOYMENT.token.address,
);

// ---- code hashes ----

let resolving: Promise<{ core: string; token: string }> | null = null;

/**
 * The contracts' code hashes, asked of the chain unless the build pinned them.
 *
 * A query is encrypted against the code hash, so a wrong one does not degrade — it stops
 * every read dead. Migrations change it. Baking one into the bundle therefore means the
 * frontend breaks on the next upgrade and stays broken until somebody redeploys, which is
 * a promise this app cannot keep on behalf of a fork it will never hear from.
 *
 * Resolving means the app talks to whatever code the contract admin migrated to. That is
 * not a new trust assumption: under a pinned hash the admin could migrate just the same and
 * the app would merely *break*. Breaking is not a security control, it is a denial of
 * service wearing one — so the pin stays available for anyone who wants it, and the default
 * is the behaviour that works.
 *
 * Memoised on the promise, not the value, so a burst of parallel queries on first load
 * shares one round trip instead of racing.
 */
export function codeHashes(): Promise<{ core: string; token: string }> {
  if (PINNED.core && PINNED.token) {
    return Promise.resolve({ core: PINNED.core, token: PINNED.token });
  }

  if (!resolving) {
    resolving = (async () => {
      const client = readOnlyClient();
      const ask = async (address: string) => {
        const { code_hash } = await client.query.compute.codeHashByContractAddress({
          contract_address: address,
        });
        if (!code_hash) throw new Error(`No code hash for ${address} — is this the right chain?`);
        return code_hash;
      };

      try {
        const [core, token] = await Promise.all([
          PINNED.core ? Promise.resolve(PINNED.core) : ask(DEPLOYMENT.core.address),
          PINNED.token ? Promise.resolve(PINNED.token) : ask(DEPLOYMENT.token.address),
        ]);
        return { core, token };
      } catch (e) {
        // Let the next attempt try again rather than caching the failure for the life of
        // the page — the usual cause is one unreachable node, and the user can change it.
        resolving = null;
        throw e;
      }
    })();
  }

  return resolving;
}

/** Drop the cached hashes, so the next query asks again. For an endpoint change. */
export function forgetCodeHashes() {
  resolving = null;
}

export const DENOM = "uscrt";
export const DECIMALS = 6;

// ---- wallet ----

interface KeplrWindow {
  keplr?: {
    enable(chainId: string): Promise<void>;
    getOfflineSignerOnlyAmino(chainId: string): unknown;
    getEnigmaUtils(chainId: string): unknown;
    signAmino(chainId: string, signer: string, doc: unknown, opts?: unknown): Promise<{ signature: { pub_key: { value: string }; signature: string } }>;
  };
  getOfflineSignerOnlyAmino?: (chainId: string) => unknown;
}

function keplr() {
  const w = window as unknown as KeplrWindow;
  if (!w.keplr) {
    throw new Error("Keplr was not found. Install the extension and reload.");
  }
  return w.keplr;
}

/**
 * Wait for the extension to inject itself.
 *
 * `window.keplr` is not there when a script first runs — the extension puts it on the page
 * during load — so anything that reaches for it on mount finds nothing and concludes the
 * wallet is missing. That race is why a reload used to look like a disconnection.
 */
export async function waitForKeplr(timeoutMs = 3_000): Promise<void> {
  const w = window as unknown as KeplrWindow;
  if (w.keplr) return;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    if (w.keplr) return;
  }
  throw new Error("Keplr was not found. Install the extension and reload.");
}

export interface Connection {
  address: string;
  client: SecretNetworkClient;
}

export async function connect(): Promise<Connection> {
  const k = keplr();
  await k.enable(DEPLOYMENT.chainId);

  const signer = k.getOfflineSignerOnlyAmino(DEPLOYMENT.chainId) as {
    getAccounts(): Promise<{ address: string }[]>;
  };
  const [account] = await signer.getAccounts();
  if (!account) throw new Error("Keplr returned no account.");

  const client = new SecretNetworkClient({
    chainId: DEPLOYMENT.chainId,
    url: lcdUrl(),
    wallet: signer as never,
    walletAddress: account.address,
    encryptionUtils: k.getEnigmaUtils(DEPLOYMENT.chainId) as never,
  });

  return { address: account.address, client };
}

/** A read-only client, so the public screens work before anyone connects a wallet. */
export function readOnlyClient(): SecretNetworkClient {
  return new SecretNetworkClient({
    chainId: DEPLOYMENT.chainId,
    url: lcdUrl(),
  });
}

// ---- the app-wide permit ----

const PERMIT_NAME = "secret-lst-app";
const PERMIT_STORAGE_KEY = "secret-lst.permit";

/**
 * Sign one permit and reuse it for every authenticated query.
 *
 * A permit is a wallet signature, not a transaction: it costs nothing, stores no secret in
 * the contract, and names the contracts it is valid for so it cannot be replayed against
 * anything else. Signing once per session and caching it is the difference between the app
 * asking for a signature on every screen and asking once.
 *
 * Cached in localStorage keyed by address. It is a capability to read the user's own
 * position, not a spending authority, and it lives only in their own browser.
 */
export async function getPermit(address: string): Promise<Permit> {
  const cached = localStorage.getItem(`${PERMIT_STORAGE_KEY}.${address}`);
  if (cached) {
    try {
      return JSON.parse(cached) as Permit;
    } catch {
      // Corrupt entry; fall through and sign a fresh one.
    }
  }

  const k = keplr();
  const permitTx = {
    chain_id: DEPLOYMENT.chainId,
    account_number: "0",
    sequence: "0",
    fee: { amount: [{ denom: DENOM, amount: "0" }], gas: "1" },
    msgs: [
      {
        type: "query_permit",
        value: {
          permit_name: PERMIT_NAME,
          // Both contracts, because one permit is supposed to cover the whole app: the
          // core answers the user's claims, the token answers their dSCRT balance. Naming
          // only one would put the signature prompt back on every second screen.
          allowed_tokens: [DEPLOYMENT.core.address, DEPLOYMENT.token.address],
          permissions: ["balance", "owner"],
        },
      },
    ],
    memo: "",
  };

  const { signature } = await k.signAmino(DEPLOYMENT.chainId, address, permitTx, {
    preferNoSetFee: true,
    preferNoSetMemo: true,
  });

  const permit = {
    params: {
      permit_name: PERMIT_NAME,
      allowed_tokens: [DEPLOYMENT.core.address, DEPLOYMENT.token.address],
      chain_id: DEPLOYMENT.chainId,
      permissions: ["balance", "owner"],
    },
    signature,
  } as unknown as Permit;

  localStorage.setItem(`${PERMIT_STORAGE_KEY}.${address}`, JSON.stringify(permit));
  return permit;
}

export function forgetPermit(address: string) {
  localStorage.removeItem(`${PERMIT_STORAGE_KEY}.${address}`);
}

/** Whether a permit for this address is already signed, so reading needs no signature. */
export function hasPermit(address: string): boolean {
  return localStorage.getItem(`${PERMIT_STORAGE_KEY}.${address}`) !== null;
}

// ---- remembering that the user connected ----

/*
 * A reload is not a disconnection, and the app should stop treating it as one.
 *
 * Nothing secret is kept here — only the fact that this browser has connected before, which
 * Keplr knows anyway, because approving a site is a decision the extension stores itself.
 * Without the flag the app cannot tell a returning user from a first-time visitor, and
 * calling `enable` on a first-time visitor throws an approval dialog at somebody who only
 * refreshed a page. With it, the reconnection is silent, which is what the user already
 * expected to happen.
 */
const SESSION_KEY = "secret-lst.connected";

export function rememberConnection(address: string) {
  localStorage.setItem(SESSION_KEY, address);
}

export function forgetConnection() {
  localStorage.removeItem(SESSION_KEY);
}

export function wasConnected(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(SESSION_KEY) !== null;
}

/**
 * Base64-encode a string in the browser.
 *
 * Deliberately not `Buffer`: it is a Node API, and Next does not polyfill it. Using it
 * here typechecked cleanly, passed every unit test, and then threw
 * `Buffer is not defined` for any user who tried to withdraw — the one code path that had
 * no browser coverage.
 */
export function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// ---- formatting ----

export function fromMicro(raw: string | number | bigint, dp = 4): string {
  const value = Number(raw) / 10 ** DECIMALS;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

export function toMicro(input: string): string {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Enter an amount.");
  return BigInt(Math.round(value * 10 ** DECIMALS)).toString();
}

/** SCRT per dSCRT. The contract reports it scaled by 10^18. */
export function rateToNumber(scaled: string): number {
  return Number(BigInt(scaled) / 10n ** 10n) / 1e8;
}

export function shortAddress(address: string): string {
  return address.length > 16 ? `${address.slice(0, 10)}…${address.slice(-6)}` : address;
}

export function whenFrom(seconds: number): string {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function untilFrom(seconds: number): string {
  const left = seconds - Math.floor(Date.now() / 1000);
  if (left <= 0) return "now";
  const days = Math.floor(left / 86_400);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(left / 3_600);
  if (hours >= 1) return `${hours} h`;
  return `${Math.max(1, Math.floor(left / 60))} min`;
}
