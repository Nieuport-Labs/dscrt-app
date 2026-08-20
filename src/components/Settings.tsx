"use client";

import { useEffect, useState } from "react";

import { DEPLOYMENT, fromMicro, shortAddress } from "@/lib/chain";
import {
  checkEndpoint,
  customEndpoints,
  forgetEndpoint,
  isDefaultEndpoint,
  lcdUrl,
  normaliseUrl,
  useEndpoint,
  type EndpointHealth,
} from "@/lib/endpoint";
import {
  availableFee,
  checkUsable,
  EXECUTE_MSG_TYPE,
  loadFeeGrants,
  periodLabel,
  preference,
  selectFeeGrant,
  setPreference,
  type FeeGrant,
  type SelectionMode,
} from "@/lib/feegrant";
import { gasCost, typicalGas } from "@/lib/protocol";

import { Drawer } from "./Drawer";
import { Alert, Check, Close, Copy, Moon, Spinner, Sun } from "./Icon";
import { useTheme } from "./Theme";

/**
 * Settings: which node, who pays the gas, and which theme.
 *
 * The endpoint picker is the point. The app is a static export talking to one LCD baked in
 * at build time, so an outage at that node takes the interface down while the protocol
 * carries on. Letting a user point somewhere else is the difference between "the app is
 * broken" and "try another node".
 *
 * Every endpoint is judged by a request, never by being on a list, and the check reports
 * which chain the node actually serves — pointing a pulsar build at a mainnet node is the
 * mistake worth catching loudly rather than letting it fail later as an empty screen.
 *
 * Fee grants are the same idea one layer down: the chain does not care whose account pays
 * for a transaction either, so if somebody has granted this wallet an allowance, that is a
 * choice worth surfacing rather than a detail to hide. See `lib/feegrant.ts`.
 */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Drawer label="Settings" onClose={onClose}>
      <div className="drawer-head">
        <h2 className="h2" style={{ flex: 1 }}>
          Settings
        </h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close settings">
          <Close />
        </button>
      </div>
      <div className="drawer-body">
        <SettingsBody />
      </div>
    </Drawer>
  );
}

/**
 * The settings themselves, without a container.
 *
 * Separated so the account panel can host them: once a wallet is connected, settings live
 * behind the gear in that panel rather than taking a second slot in the bar. They keep
 * their own place in the bar while disconnected, because choosing a node is exactly what
 * somebody needs when nothing is working — including, sometimes, connecting.
 *
 * The address arrives as a prop rather than from `useWallet`. Reaching for the hook here
 * would close a cycle — settings to wallet to account panel and back to settings — and
 * the panel that holds a connected session is the one that already knows the address.
 */
export function SettingsBody({ address }: { address?: string | null }) {
  const { theme, toggle } = useTheme();
  const [current, setCurrent] = useState("");
  const [known, setKnown] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [health, setHealth] = useState<Record<string, EndpointHealth | "checking">>({});

  useEffect(() => {
    setCurrent(lcdUrl());
    setKnown([DEPLOYMENT.lcdUrl, ...customEndpoints()]);
  }, []);

  const check = async (url: string) => {
    setHealth((h) => ({ ...h, [url]: "checking" }));
    const result = await checkEndpoint(url);
    setHealth((h) => ({ ...h, [url]: result }));
    return result;
  };

  // Measure everything on the list once, so the choice is informed rather than a guess.
  useEffect(() => {
    if (known.length === 0) return;
    void Promise.all(known.map((url) => check(url)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known.join("|")]);

  const add = async () => {
    const url = normaliseUrl(draft);
    if (!url) {
      setHealth((h) => ({
        ...h,
        __draft: {
          url: draft,
          ok: false,
          latencyMs: null,
          chainId: null,
          height: null,
          error: "That is not a valid https address",
        },
      }));
      return;
    }
    setDraft("");
    setKnown((list) => (list.includes(url) ? list : [...list, url]));
    await check(url);
  };

  const draftError = health.__draft;

  return (
    <>
      <section className="stack" style={{ gap: "var(--s-3)" }}>
        <div className="row">
          <span className="k">Appearance</span>
          <button className="btn btn--quiet btn--sm" onClick={toggle}>
            {theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
            {theme === "dark" ? "Dark" : "Light"}
          </button>
        </div>
      </section>

      <hr className="divider" />

      <section className="stack" style={{ gap: "var(--s-3)" }}>
        <h3 className="h3">Node</h3>

        <div className="stack" style={{ gap: "var(--s-2)" }}>
          {known.map((url) => (
            <EndpointRow
              key={url}
              url={url}
              isCurrent={url === current}
              isDefault={url === DEPLOYMENT.lcdUrl}
              health={health[url]}
              onUse={() => useEndpoint(url === DEPLOYMENT.lcdUrl ? null : url)}
              onRecheck={() => void check(url)}
              onForget={() => {
                forgetEndpoint(url);
                setKnown((list) => list.filter((u) => u !== url));
              }}
            />
          ))}
        </div>

        <div className="field">
          <label htmlFor="endpoint">Add an endpoint</label>
          <div className="field-row">
            <input
              id="endpoint"
              className="input"
              placeholder="https://lcd.example.com"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void add()}
              spellCheck={false}
            />
            <button className="btn btn--quiet btn--sm" onClick={() => void add()}>
              Add
            </button>
          </div>
          {draftError && draftError !== "checking" && (
            <span className="hint" style={{ color: "var(--bad)" }}>
              {draftError.error}
            </span>
          )}
        </div>
      </section>

      <hr className="divider" />

      <FeeGrants address={address} />

      <hr className="divider" />

      <section className="stack" style={{ gap: "var(--s-2)" }}>
        <h3 className="h3">Deployment</h3>
        <dl className="stack" style={{ gap: "var(--s-2)", margin: 0 }}>
          <div className="row">
            <dt>Network</dt>
            <dd className="num">{DEPLOYMENT.chainId}</dd>
          </div>
          <CopyRow label="Staking contract" value={DEPLOYMENT.core.address} />
          <CopyRow label="dSCRT token" value={DEPLOYMENT.token.address} />
        </dl>
        {!isDefaultEndpoint() && (
          <p className="hint">
            You are on a custom node. Clear it by choosing the default above.
          </p>
        )}
      </section>
    </>
  );
}

function EndpointRow({
  url,
  isCurrent,
  isDefault,
  health,
  onUse,
  onRecheck,
  onForget,
}: {
  url: string;
  isCurrent: boolean;
  isDefault: boolean;
  health: EndpointHealth | "checking" | undefined;
  onUse: () => void;
  onRecheck: () => void;
  onForget: () => void;
}) {
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();

  return (
    <div className={`opt${isCurrent ? " opt--on" : ""}`}>
      <div className="opt-main">
        <div className="opt-title">
          <span className="opt-name">{host}</span>
          {isDefault && <span className="pill">default</span>}
          {isCurrent && (
            <span className="pill pill--accent">
              <Check size={11} /> in use
            </span>
          )}
        </div>
        <div className="opt-meta hint">
          {health === "checking" || health === undefined ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Spinner size={11} /> checking
            </span>
          ) : health.ok ? (
            <>
              <span style={{ color: "var(--good)" }}>{health.latencyMs} ms</span>
              <span>block {health.height?.toLocaleString()}</span>
            </>
          ) : (
            <span
              style={{ color: "var(--bad)", display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <Alert size={11} /> {health.error}
            </span>
          )}
        </div>
      </div>

      <div className="opt-actions">
        {!isCurrent && (
          <button
            className="btn btn--quiet btn--sm"
            onClick={onUse}
            disabled={health !== "checking" && health !== undefined && !health.ok}
          >
            Use
          </button>
        )}
        {!isCurrent && !isDefault && (
          <button className="icon-btn" onClick={onForget} aria-label={`Remove ${host}`}>
            <Close size={14} />
          </button>
        )}
        {isCurrent && (
          <button className="btn btn--quiet btn--sm" onClick={onRecheck}>
            Recheck
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Who pays the gas.
 *
 * `x/feegrant` lets one account cover another's transaction fees and nothing else — it can
 * never move the granter's money — so a grant is a strictly weaker thing to accept than a
 * transfer. That is the whole reason this can be a setting rather than a warning.
 *
 * The panel only ever *spends* grants. Making one is a decision about somebody else's
 * money and belongs in their own wallet, or in the dashboard this app borrowed its reader
 * from: https://github.com/jirkacepelka/fee-granter.
 *
 * Grants are listed as the chain reports them, including the ones that cannot pay, with
 * the reason. An expired or exhausted grant looks identical to a working one right up
 * until a transaction fails, and this panel is the only place that difference can be shown
 * before it costs anybody a signature.
 */
function FeeGrants({ address }: { address?: string | null }) {
  const [mode, setMode] = useState<SelectionMode>("auto");
  const [pinned, setPinned] = useState<string | null>(null);
  const [grants, setGrants] = useState<FeeGrant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = preference();
    setMode(stored.mode);
    setPinned(stored.granter);
  }, []);

  useEffect(() => {
    if (!address) {
      setGrants(null);
      return;
    }
    let cancelled = false;
    setError(null);
    void loadFeeGrants(address)
      .then((list) => {
        if (!cancelled) setGrants(list);
      })
      .catch(() => {
        if (!cancelled) setError("Could not read grants from this node.");
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  // The fee a grant is judged against: one deposit, sized for a full validator set. The
  // panel has to answer "can this pay?" before knowing which button will be pressed, so it
  // asks about the largest of the everyday transactions and errs towards saying no.
  const fee = String(gasCost(typicalGas()));

  const choose = (next: SelectionMode, granter?: string | null) => {
    setMode(next);
    if (granter !== undefined) setPinned(granter);
    setPreference(next, granter);
  };

  /*
   * Which grant would actually pay, asked the same way a transaction asks.
   *
   * Marking every usable grant instead would be the easy version and a small lie: in `auto`
   * exactly one of them is spent, chosen by a ranking the user cannot see, and a panel that
   * highlights three of them has told them nothing about which.
   */
  const chosen =
    grants === null
      ? undefined
      : selectFeeGrant(grants, {
          mode,
          granter: pinned ?? undefined,
          fee,
          msgTypeUrls: [EXECUTE_MSG_TYPE],
        }).granter;

  return (
    <section className="stack" style={{ gap: "var(--s-3)" }}>
      <h3 className="h3">Fee grants</h3>

      <div className="segmented segmented--full">
        <button aria-pressed={mode !== "off"} onClick={() => choose(pinned ? "select" : "auto")}>
          Use a grant
        </button>
        <button aria-pressed={mode === "off"} onClick={() => choose("off")}>
          Pay my own
        </button>
      </div>

      {!address ? (
        <p className="hint">
          Connect a wallet to see whether anyone has granted it an allowance for fees.
        </p>
      ) : error ? (
        <p className="hint" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      ) : grants === null ? (
        <p className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Spinner size={11} /> looking for grants
        </p>
      ) : grants.length === 0 ? (
        <p className="hint">
          Nobody has granted this address an allowance, so transactions are paid from your
          own SCRT. That is the ordinary case.
        </p>
      ) : (
        <div className="stack" style={{ gap: "var(--s-2)" }}>
          {grants.map((grant) => (
            <GrantRow
              key={grant.granter}
              grant={grant}
              fee={fee}
              active={chosen === grant.granter}
              exclusive={mode === "select" && pinned === grant.granter}
              onPin={() => choose("select", grant.granter)}
              onUnpin={() => choose("auto", null)}
            />
          ))}
        </div>
      )}

      {address && grants !== null && grants.length > 0 && (
        <p className="hint">
          {mode === "off"
            ? "Fees come out of your own balance."
            : mode === "select"
              ? "Only the pinned grant is spent. If it cannot pay, you do."
              : "The best grant that covers the fee is spent. If none can, you pay."}
        </p>
      )}
    </section>
  );
}

/** One grant: whose it is, what is left of it, and whether it can pay. */
function GrantRow({
  grant,
  fee,
  active,
  exclusive,
  onPin,
  onUnpin,
}: {
  grant: FeeGrant;
  fee: string;
  active: boolean;
  exclusive: boolean;
  onPin: () => void;
  onUnpin: () => void;
}) {
  const problem = checkUsable(grant, { fee, msgTypeUrls: [EXECUTE_MSG_TYPE] });
  const left = availableFee(grant);
  const period = periodLabel(grant);

  // Said in the user's terms rather than the module's: what they need is whether this will
  // pay, and if not, whether that is temporary.
  const why = {
    expired: "expired",
    insufficient: "not enough left for a transaction",
    "message-not-allowed": "does not cover this app's transactions",
  } as const;

  return (
    <div className={`opt${active ? " opt--on" : ""}`}>
      <div className="opt-main">
        <div className="opt-title">
          <span className="opt-name opt-name--mono" title={grant.granter}>
            {shortAddress(grant.granter)}
          </span>
          {active && (
            <span className="pill pill--accent">
              <Check size={11} /> pays
            </span>
          )}
          {exclusive && <span className="pill">pinned</span>}
          {problem && <span className="pill pill--warn">unusable</span>}
        </div>
        <div className="opt-meta hint">
          {problem ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Alert size={11} /> {why[problem]}
            </span>
          ) : (
            <>
              <span className="num">
                {left === undefined ? "uncapped" : `${fromMicro(left.toString(), 2)} SCRT`}
              </span>
              {period && <span>{period}</span>}
            </>
          )}
        </div>
      </div>

      <div className="opt-actions">
        {exclusive ? (
          <button className="btn btn--quiet btn--sm" onClick={onUnpin}>
            Unpin
          </button>
        ) : (
          <button className="btn btn--quiet btn--sm" onClick={onPin} disabled={Boolean(problem)}>
            Pin
          </button>
        )}
      </div>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="row">
      <dt>{label}</dt>
      <dd>
        <button
          className="mini"
          title={value}
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />} {shortAddress(value)}
        </button>
      </dd>
    </div>
  );
}
