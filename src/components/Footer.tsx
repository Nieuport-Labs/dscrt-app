import Link from "next/link";

import { External } from "./Icon";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span>
          Non-custodial. Deposits, withdrawals and claims are contract calls signed in your
          own wallet.
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--s-5)" }}>
          <Link href="/keeper">Run upkeep</Link>
          {/*
            * Two links, because they answer different questions. "Interface" is this app —
            * what you are looking at, and what you would fork to run your own. "Contracts"
            * is where the money actually lives, and it is the one worth auditing.
            */}
          <a
            href="https://github.com/Nieuport-Labs/dscrt-app"
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            Interface <External size={12} />
          </a>
          <a
            href="https://github.com/Nieuport-Labs/dscrt-contracts"
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            Contracts <External size={12} />
          </a>
        </span>
      </div>
    </footer>
  );
}
