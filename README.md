<p align="center">
  <img src="public/brand/Gitbar.png" alt="" width="100%">
</p>

# dscrt-app

The web interface for [dSCRT](https://github.com/Nieuport-Labs/dscrt-contracts), liquid staking on
Secret Network.

Stake SCRT, receive a liquid derivative that appreciates against it, request withdrawals,
claim them when they mature. There is no server: reads are contract queries and writes are
signed in your own wallet, which is what lets the whole thing be a static export.

## Run it

```bash
npm ci
npm run dev
```

**No configuration.** The deployment is compiled in, so a fresh clone talks to the live
dSCRT contracts immediately. `.env.example` documents the overrides for a fork pointed
somewhere else; you need none of them to run this one.

```bash
npm run build        # static export into out/
npx serve out        # serve it the way a static host would
```

## Hosting your own

This app serves one protocol — it is not a white-label frontend — but nothing stops anyone
running their own copy of it, and the design assumes somebody will. Any static host works:
build, upload `out/`, done. On Vercel, leave the Root Directory and the Output Directory
empty and set **no** environment variables.

Two things worth knowing if you do:

**The LCD endpoint is the user's choice, not the host's.** The default node is baked in,
but any visitor can point the app at a different one from the settings in the wallet panel.
It takes effect immediately, with no rebuild, and the app refuses a node serving the wrong
chain. So hosting a copy does not make your visitors dependent on a node you picked.

**Do not set `NEXT_PUBLIC_*_CODE_HASH`.** Secret encrypts contract queries against the
contract's code hash, and that hash changes every time the contract is migrated. Left
unset, the app asks the chain and follows migrations on its own. Set it, and the app stops
working the moment the protocol is upgraded. It exists as a deliberate pin for anyone who
wants one, and it is the most likely way to break an otherwise working deployment.

## What is private and what is not

Secret encrypts contract *state*, not the bank or staking modules. So:

- **Public**: your deposit (a native SCRT transfer), the protocol's delegations, the
  exchange rate, TVL, the validator set.
- **Private**: your dSCRT balance and transfers, and — after your first transfer — which
  deposit was yours.

The app reads your private balance with a SNIP-24 permit: a wallet signature, not a
transaction. It costs nothing, is stored only in your browser, names the two contracts it
is valid for, and cannot be replayed anywhere else. Disconnecting deletes it.

## Fee grants

Somebody else can pay your gas. `x/feegrant` is a module of the chain: an account grants
another account an allowance spendable on transaction fees and **on nothing else** — it can
never move the granter's money — so accepting one is strictly weaker than accepting a
transfer. It is what the [keeper](https://github.com/Nieuport-Labs/dscrt-keeper) has always
run on, and the same reasoning holds for a person staking from a browser: arriving with SCRT
to stake and no SCRT to pay for staking it is a genuinely awkward first minute.

Settings shows every grant made to your address, including the ones that cannot pay and why,
and spends the best one automatically. Turn it off there to pay your own way, or pin a single
granter. Nothing changes for a wallet nobody has granted anything, which is the usual case.

This app never *makes* a grant — that is a decision about the granter's money and belongs in
their own wallet, or in [fee-granter](https://github.com/jirkacepelka/fee-granter), whose
`feegrant-sdk.ts` is vendored here as `src/lib/feegrant-sdk.ts` to do the reading.

## Where the rest lives

Contracts, deploy scripts and the runbook are in
[dscrt-contracts](https://github.com/Nieuport-Labs/dscrt-contracts); the upkeep bot is in
[dscrt-keeper](https://github.com/Nieuport-Labs/dscrt-keeper). All three were split out of `jirkacepelka/SteakSCRT`, which is now archived.

## Brand

`public/brand/` holds the mark (`App logo.png`), the banner above (`Gitbar.png`), and the
token icons the interface itself uses. They ship with the app because the interface serves
them; a fork running its own copy is welcome to keep them or replace them.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
