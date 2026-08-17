/**
 * Do the interfaces in `src/lib/protocol.ts` still describe what the contract returns?
 *
 * The contract's types live in another repository, in Rust, and these are hand-written
 * mirrors. Nothing compiles the two together, so a renamed field is not a build error
 * anywhere — it is `undefined` rendered into a page, in front of a user, for however long
 * it takes somebody to notice a number went blank.
 *
 * This asks the live chain and compares key sets **in both directions**: a field the
 * contract dropped, and a field the contract grew that these types do not model. The second
 * direction is the one that catches the protocol moving ahead of the interface.
 *
 * Values are deliberately not asserted. This runs against a live chain whose numbers change
 * every block, and a test that flakes gets muted, and a muted test is worse than none.
 *
 * Run on a schedule rather than on every pull request — a testnet having a bad afternoon is
 * not a reason to block a merge.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { SecretNetworkClient } from "secretjs";

/*
 * Types only. They are erased before this file runs, so importing them does not drag in
 * `src/lib/chain.ts` and the browser-shaped module graph behind it — the app's imports are
 * extensionless, which Next resolves through its bundler and plain Node does not.
 *
 * The consequence is that the deployment below is a copy rather than an import. It is
 * checked against the real one by the first test, which fails loudly if they disagree.
 */
import type {
  Config,
  ProtocolState,
  UnbondWindow,
  ValidatorEntry,
} from "../src/lib/protocol.ts";

const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || "pulsar-3";
const LCD = process.env.NEXT_PUBLIC_LCD_URL || "https://pulsar.lcd.secretnodes.com";
const CORE =
  process.env.NEXT_PUBLIC_CORE_ADDRESS || "secret1lj23n74aan7nlgj6hfm45fh3gc7h2ctdplsw8y";
const TOKEN =
  process.env.NEXT_PUBLIC_TOKEN_ADDRESS || "secret1hvt29j32a9k839n057p9qr75mgake8y9yjurq3";

/*
 * TypeScript types are erased at runtime, so the key list has to exist as data. `satisfies`
 * keeps the two honest: the compiler rejects an array naming a key the interface does not
 * have, so this cannot rot into a list of fields nobody declares.
 */
const STATE_KEYS = [
  "total_bonded",
  "pending_rewards",
  "liquid_unallocated",
  "scrt_owed_to_windows",
  "total_supply",
  "last_sync_time",
  "is_unattended",
  "exchange_rate",
] as const satisfies readonly (keyof ProtocolState)[];

const CONFIG_KEYS = [
  "manager",
  "limits",
  "validator_allowlist",
  "bootstrapped",
  "treasury",
  "token",
  "bonded_denom",
  "params",
  "paused",
] as const satisfies readonly (keyof Config)[];

const PARAM_KEYS = [
  "unbond_window_secs",
  "unbonding_period_secs",
  "performance_fee_bps",
  "withdrawal_fee_bps",
  "min_deposit",
  "sync_stale_after_secs",
  "max_unbond_entries_per_validator",
] as const satisfies readonly (keyof Config["params"])[];

const VALIDATOR_KEYS = [
  "address",
  "weight_bps",
  "status",
  "bonded",
  "pending_rewards",
  "active_unbond_entries",
] as const satisfies readonly (keyof ValidatorEntry)[];

const WINDOW_KEYS = [
  "id",
  "opened_at",
  "closes_at",
  "matures_at",
  "shares_burned",
  "scrt_owed",
  "scrt_realised",
  "scrt_claimed",
  "validators_used",
  "state",
] as const satisfies readonly (keyof UnbondWindow)[];

function compare(what: string, declared: readonly string[], actual: object) {
  const got = Object.keys(actual);

  const missing = declared.filter((k) => !got.includes(k));
  const unknown = got.filter((k) => !declared.includes(k));

  assert.deepEqual(
    missing,
    [],
    `${what}: the contract no longer returns ${missing.join(", ")} — protocol.ts describes a protocol that has moved on`,
  );
  assert.deepEqual(
    unknown,
    [],
    `${what}: the contract returned ${unknown.join(", ")}, which protocol.ts does not model — the protocol grew something this app cannot see`,
  );
}

const client = new SecretNetworkClient({ chainId: CHAIN_ID, url: LCD });

/** The same resolution the app performs, so this test breaks where the app would. */
async function codeHash(address: string): Promise<string> {
  const { code_hash } = await client.query.compute.codeHashByContractAddress({
    contract_address: address,
  });
  assert.ok(code_hash, `${LCD} has no code hash for ${address}`);
  return code_hash;
}

async function queryCore<T>(query: object): Promise<T> {
  return (await client.query.compute.queryContract({
    contract_address: CORE,
    code_hash: await codeHash(CORE),
    query,
  })) as T;
}

test("State matches ProtocolState", async () => {
  const { state } = await queryCore<{ state: ProtocolState }>({ state: {} });
  compare("State", STATE_KEYS, state);
});

test("Config matches Config", async () => {
  const { config } = await queryCore<{ config: Config }>({ config: {} });
  compare("Config", CONFIG_KEYS, config);
  compare("Config.params", PARAM_KEYS, config.params);
});

test("Validators match ValidatorEntry", async () => {
  const answer = await queryCore<{ validators: { validators: ValidatorEntry[] } }>({
    validators: {},
  });
  const validators = answer.validators.validators;
  assert.ok(validators.length > 0, "the protocol reported no validators at all");
  for (const v of validators) compare(`Validator ${v.address}`, VALIDATOR_KEYS, v);
});

test("Windows match UnbondWindow", async () => {
  const answer = await queryCore<{ windows: { windows: UnbondWindow[] } }>({
    windows: { state: null, start_after: null, limit: 50 },
  });
  const windows = answer.windows.windows;
  assert.ok(windows.length > 0, "the protocol reported no windows — one is open from birth");
  for (const w of windows) compare(`Window ${w.id}`, WINDOW_KEYS, w);
});

/*
 * Runtime resolution is what lets this app follow a migration without a redeploy, so prove
 * the chain will actually answer rather than trusting that it does. Every test above
 * depends on it; this one says so out loud.
 */
test("the code hashes resolve from the chain", async () => {
  const [core, token] = await Promise.all([codeHash(CORE), codeHash(TOKEN)]);
  assert.match(core, /^[0-9a-f]{64}$/, "core code hash is not a hash");
  assert.match(token, /^[0-9a-f]{64}$/, "token code hash is not a hash");
  assert.notEqual(core, token, "both contracts cannot be running the same code");
});

/**
 * The addresses above are copied from `src/lib/chain.ts`, so check they still match it.
 *
 * Read as text rather than imported, for the reason given at the top of this file. Crude,
 * and it is the only thing standing between a copied constant and a test that passes
 * confidently against the wrong contract.
 */
test("the deployment here matches the one the app ships", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/lib/chain.ts", import.meta.url), "utf8");

  for (const [what, address] of [
    ["core", CORE],
    ["token", TOKEN],
  ] as const) {
    assert.ok(
      source.includes(address),
      `src/lib/chain.ts no longer contains the ${what} address this test uses (${address})`,
    );
  }
});
