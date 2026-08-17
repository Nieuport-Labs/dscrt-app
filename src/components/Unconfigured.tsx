import { Alert } from "./Icon";

/**
 * Shown when the build has been pointed somewhere other than dSCRT, incompletely.
 *
 * A stock build never reaches this — the deployment is compiled in and works with no
 * configuration at all. It exists for a fork that overrode part of the deployment and left
 * the rest, which is a deployment mistake whose first symptom is otherwise a JSON parse
 * error, because every query goes to a path that serves the app's own HTML back.
 */
export function Unconfigured() {
  return (
    <div className="centred">
      <div className="card" style={{ width: "min(520px, 100%)", padding: "var(--s-6)" }}>
        <div className="notice notice--warn" style={{ marginBottom: "var(--s-4)" }}>
          <Alert size={16} />
          <span>This build has no contract addresses, so every query would go nowhere.</span>
        </div>
        <p className="prose">
          These default to the live dSCRT deployment, so a build that shows this has
          overridden some of them and left others empty. Set them in the hosting environment
          and rebuild — they are compiled into the bundle, so saving them is not enough on
          its own. Clearing them entirely also works, and goes back to dSCRT.
        </p>
        <pre className="payload" style={{ marginTop: "var(--s-4)" }}>
          {[
            "NEXT_PUBLIC_CHAIN_ID",
            "NEXT_PUBLIC_LCD_URL",
            "NEXT_PUBLIC_CORE_ADDRESS",
            "NEXT_PUBLIC_TOKEN_ADDRESS",
          ].join("\n")}
        </pre>
      </div>
    </div>
  );
}

/**
 * Shown when the contracts' code hashes could not be established.
 *
 * A different failure from the one above, and worth saying differently. That one is aimed
 * at whoever deployed the build; this one reaches *users*, because the usual cause is the
 * node being unreachable rather than anything being misconfigured — and the fix is in the
 * reader's hands, one setting away, without a rebuild.
 */
export function Unreachable({ detail, onRetry }: { detail: string; onRetry: () => void }) {
  return (
    <div className="centred">
      <div className="card" style={{ width: "min(520px, 100%)", padding: "var(--s-6)" }}>
        <div className="notice notice--bad" style={{ marginBottom: "var(--s-4)" }}>
          <Alert size={16} />
          <span>{detail}</span>
        </div>
        <p className="prose">
          The app asks the chain which code the contracts are running before it can read
          anything, because queries here are encrypted against that answer. It could not
          get one.
        </p>
        <p className="prose" style={{ marginTop: "var(--s-3)" }}>
          Nothing is wrong with the protocol or with your funds — this is the connection to
          a node. You can point the app at a different one from the settings in the wallet
          panel; it takes effect immediately, with no rebuild.
        </p>
        <button className="btn btn--block" style={{ marginTop: "var(--s-4)" }} onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}
