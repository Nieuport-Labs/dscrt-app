/**
 * Does the fee grant reader still understand the grants this protocol actually issues?
 *
 * `src/lib/feegrant-sdk.ts` is a vendored copy of another project's file, and the point of
 * vendoring is that it does not move unless somebody moves it. What can move underneath it
 * is *this* app: the message type it sends, and the shape of grant an operator is told to
 * make. Both are asserted here.
 *
 * Offline and deterministic, unlike `shapes.test.ts` — every fixture below is a literal, so
 * this one is safe to run on every pull request.
 *
 * The fixtures are the real shape, not a convenient one. The chain models the keeper's
 * grant as an `Any` inside an `Any` inside an `Any`: `AllowedMsgAllowance` restricting the
 * message types, wrapping a `PeriodicAllowance` holding the daily budget, wrapping a
 * `BasicAllowance` holding the lifetime cap. Flattening that is the only interesting thing
 * the parser does, and it is the thing a lazier fixture would not exercise.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  availableFee,
  checkUsable,
  estimateFee,
  parseFeeGrant,
  selectFeeGrant,
} from "../src/lib/feegrant-sdk.ts";

/** Secret's compute module, not CosmWasm's. Mirrors `EXECUTE_MSG_TYPE` in `feegrant.ts`. */
const EXECUTE = "/secret.compute.v1beta1.MsgExecuteContract";

const GRANTEE = "secret1grantee00000000000000000000000000000";

/** A grant shaped the way the keeper's README tells an operator to make one. */
function narrowGrant(over: { canSpend?: string; expiration?: string; messages?: string[] } = {}) {
  return {
    granter: "secret1granter0000000000000000000000000000",
    grantee: GRANTEE,
    allowance: {
      "@type": "/cosmos.feegrant.v1beta1.AllowedMsgAllowance",
      allowed_messages: over.messages ?? [EXECUTE],
      allowance: {
        "@type": "/cosmos.feegrant.v1beta1.PeriodicAllowance",
        basic: {
          spend_limit: [],
          expiration: over.expiration ?? null,
        },
        period: "86400s",
        period_spend_limit: [{ denom: "uscrt", amount: "1000000" }],
        period_can_spend: [{ denom: "uscrt", amount: over.canSpend ?? "1000000" }],
        period_reset: "2026-08-21T00:00:00Z",
      },
    },
  };
}

test("flattens the three-layer allowance the protocol actually grants", () => {
  const grant = parseFeeGrant(narrowGrant());
  assert.ok(grant, "a grant this shape must parse, not be skipped as unrecognised");

  assert.equal(grant.kind, "periodic");
  assert.equal(grant.periodSeconds, 86_400, 'proto3-JSON "86400s" must survive the trip');
  assert.equal(grant.periodCanSpend, "1000000");
  assert.deepEqual(grant.allowedMessages, [EXECUTE]);
  // An empty `spend_limit` is "uncapped", which is not the same as zero.
  assert.equal(grant.spendLimit, undefined);
  assert.equal(availableFee(grant), 1_000_000n);
});

test("a grant for someone else's messages is refused before a wallet is asked to sign", () => {
  // The failure this prevents: the chain rejects the transaction *after* the user has
  // signed it, which costs them a signature and tells them nothing useful.
  const grant = parseFeeGrant(narrowGrant({ messages: ["/cosmos.bank.v1beta1.MsgSend"] }))!;
  assert.equal(
    checkUsable(grant, { fee: "17188", msgTypeUrls: [EXECUTE] }),
    "message-not-allowed",
  );
});

test("an exhausted period reads as insufficient rather than as usable", () => {
  const grant = parseFeeGrant(narrowGrant({ canSpend: "100" }))!;
  assert.equal(checkUsable(grant, { fee: "17188", msgTypeUrls: [EXECUTE] }), "insufficient");
});

test("an expired grant is caught, and the clock is injectable so this cannot flake", () => {
  const grant = parseFeeGrant(narrowGrant({ expiration: "2026-01-01T00:00:00Z" }))!;
  assert.equal(
    checkUsable(grant, {
      fee: "17188",
      msgTypeUrls: [EXECUTE],
      now: new Date("2026-08-20T00:00:00Z"),
    }),
    "expired",
  );
  assert.equal(
    checkUsable(grant, {
      fee: "17188",
      msgTypeUrls: [EXECUTE],
      now: new Date("2025-12-31T00:00:00Z"),
    }),
    undefined,
  );
});

test("auto picks a usable grant, and picks nothing when none can pay", () => {
  const usable = parseFeeGrant(narrowGrant())!;
  const broke = parseFeeGrant(narrowGrant({ canSpend: "1" }))!;
  broke.granter = "secret1broke000000000000000000000000000000";

  const ctx = { fee: "17188", msgTypeUrls: [EXECUTE] };

  const chosen = selectFeeGrant([broke, usable], ctx);
  assert.equal(chosen.granter, usable.granter);

  const none = selectFeeGrant([broke], ctx);
  assert.equal(none.granter, undefined, "no granter means the user pays, not that it throws");
  assert.equal(none.reason, "no-usable-grant");
});

test("off pays from the user's own balance even when a grant would cover it", () => {
  const usable = parseFeeGrant(narrowGrant())!;
  const choice = selectFeeGrant([usable], {
    mode: "off",
    fee: "17188",
    msgTypeUrls: [EXECUTE],
  });
  assert.equal(choice.granter, undefined);
  assert.equal(choice.reason, "off");
});

test("a pinned granter that stopped being usable falls back rather than being spent", () => {
  const broke = parseFeeGrant(narrowGrant({ canSpend: "1" }))!;
  const choice = selectFeeGrant([broke], {
    mode: "select",
    granter: broke.granter,
    fee: "17188",
    msgTypeUrls: [EXECUTE],
  });
  assert.equal(choice.granter, undefined);
  assert.equal(choice.rejected, "insufficient");
});

test("the fee a grant is judged against matches what the app declares", () => {
  // A deposit at a full validator set: (125_000 + 7_500 * 20) * 2.5 gas at 0.025 uscrt.
  // Kept in step with `typicalGas()` and `GAS_PRICE` in src/lib/protocol.ts by hand — the
  // numbers there are measured values, and a copy that drifts low would judge a grant able
  // to pay a fee it cannot.
  const gas = Math.ceil((125_000 + 7_500 * 20) * 2.5);
  assert.equal(gas, 687_500);
  assert.equal(estimateFee(gas, 0.025), "17188");
});
