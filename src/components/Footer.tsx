"use client";

import Link from "next/link";

import { DEPLOYMENT } from "@/lib/chain";

import { External } from "./Icon";

/**
 * Which chain this build talks to.
 *
 * Testnets say so. Nobody should discover which chain they are on from a failed
 * transaction — but it does not belong in the bar either. It never changes, it is never
 * something to act on, and a badge beside the Connect button reads like a warning about
 * the session rather than a fact about the build. Down here it sits with the other
 * standing facts, which is what it is.
 */
function NetworkPill() {
  const isMainnet = DEPLOYMENT.chainId === "secret-4";
  if (isMainnet) return null;
  return (
    <span className="net" title={`Connected to ${DEPLOYMENT.chainId}`}>
      <span className="dot" />
      <span>{DEPLOYMENT.chainId}</span>
    </span>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span>
          Non-custodial. Deposits, withdrawals and claims are contract calls signed in your
          own wallet.
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--s-5)" }}>
          <NetworkPill />
          <Link href="/keeper">Run upkeep</Link>
          {/*
            * Two links, because they answer different questions. "Source" is this app —
            * what you are looking at, and what you would fork to run your own. "Contracts"
            * is where the money actually lives, and it is the one worth auditing.
            */}
          <a
            href="https://github.com/Nieuport-Labs/dscrt-app"
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            Source <External size={12} />
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
