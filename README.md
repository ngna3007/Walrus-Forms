# Walrus Forms

**Decentralized feedback, bug bounty, and survey forms - stored on Walrus, gated by Seal, paid out on Sui.**

Walrus Forms is a hosted alternative to Google Forms, Tally, or Typeform where submissions never touch a centralized database. Every response is encrypted client-side under an on-chain Seal policy, stored as a Walrus blob, and indexed by a Sui Move object. Form owners triage and resolve reports directly from their wallet, mint soulbound receipts as portable reputation, and pay severity-tiered bounties from a single signed transaction.

Built for the **Walrus Session 2 - Form Tooling** hackathon (Builder Tools track).

---

## Why

Today's feedback tools own your data. Reports vanish into someone else's database, bounty payouts depend on trust, and submitters never know what happened to their reports. Walrus Forms flips that around:

- **Submissions live on Walrus.** Encrypted at rest, decryptable only by wallets the form owner gates through Seal.
- **Bounties pay out trustlessly.** Severity-tiered amounts wired into the form schema; one click transfers WAL or SUI from the owner's wallet on resolve.
- **Reputation is portable.** Resolved reports mint soulbound `SubmissionReceipt` NFTs to the submitter that any future Sui dApp can recognize.
- **Submitters keep their privacy.** Anonymous by default. Wallet identity opt-in for receipts and bounty payouts.

---

## Features

### For form owners
- Multiple input options with rich text, screenshots, video uploads, and 9 field types
- Four Seal encryption policies: public, allowlist, time-lock, NFT-bound
- Severity-tiered bug bounties (Low / Medium / High / Critical) paid in WAL or SUI
- One-signature publish: allowlist creation, on-chain Form object, and Walrus schema upload in a single Programmable Transaction Block
- Live cost preview in WAL with inline SUI to WAL swap at publish time
- Batch decrypt: one Seal session signature unlocks every submission in the table
- Status machine: Open / Triaged / In Progress / Resolved with on-chain enforcement
- Auto-archive and shared-with-you tabs for triagers added to the allowlist

### For submitters
- Google sign-in through Enoki - no seed phrase, no extension required
- Sponsored gas: zero-cost submission, even for first-time wallet users
- Encryption happens in the browser before bytes leave the device
- Soulbound receipts arrive directly in the submitter's wallet on resolve

### Under the hood
- Sui Move 2024.beta contracts: `form_registry`, `submission`, `triage`, `seal_policies`, `reputation`
- Anti-self-credit gates on `mint_receipt` and bounty payout (submitter must differ from form owner)
- Strict identity parsing on Seal `seal_approve_*` entry functions (allowlist 48 bytes, timelock 24 bytes, etc.)
- Chain-status hydration on every dashboard tick - local optimism never persists past one chain confirmation
- Owner-scoped Supabase RLS via `x-owner-key` header (per-wallet cache, never global)

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  Builder / Submitter (React + Vite, Tailwind v4, dApp Kit)         │
└────────┬────────────────────────────────────────────┬──────────────┘
         │ schema, payload                            │ wallet signs
         ▼                                            ▼
┌────────────────────────┐         ┌──────────────────────────────────┐
│  Walrus storage        │         │  Sui (Testnet / Mainnet)         │
│  - schema blob         │◄────────┤  - Form (shared object)          │
│  - submission blob     │         │  - Allowlist (shared object)     │
│  - file blob(s)        │         │  - Submission (shared object)    │
└────────────────────────┘         │  - SubmissionReceipt (soulbound) │
         ▲                         │  - bounty payout (Coin<T>)       │
         │ aggregator GET          └──────────────────────────────────┘
         │
┌────────────────────────┐         ┌──────────────────────────────────┐
│  Seal key servers      │         │  Enoki sponsor (Cloudflare       │
│  (threshold IBE)       │         │  Worker / Hono service)          │
└────────────────────────┘         └──────────────────────────────────┘
```

Submission flow:
1. Submitter fills form. Payload + uploaded files are encoded.
2. Seal encrypts each blob client-side under the form's policy identity.
3. Walrus stores the ciphertext blob, returns a blob ID.
4. PTB calls `submission::submit(form, blob_id, file_blob_ids, clock)`. Enoki sponsors gas.
5. Form owner runs `Decrypt all`. Seal issues a session key, every locked row decrypts in one batch.
6. Owner picks severity, hits `Resolve & pay`. One signed PTB: `triage::transition` + `reputation::mint_receipt` + `coin::transfer` for the tier amount.

---

## Tech stack

| Layer | Tools |
| --- | --- |
| Smart contracts | Sui Move 2024.beta, Move Prover-friendly |
| Frontend | React 18, Vite 5, TypeScript 5, Tailwind v4, React Router v7 |
| Sui SDKs | `@mysten/sui`, `@mysten/dapp-kit`, `@mysten/seal`, `@mysten/walrus`, `@mysten/enoki` |
| Persistence | Supabase (owner-scoped RLS), localStorage cache |
| Auth | Slush, Phantom, Suiet, Enoki zkLogin (Google) |
| Storage | Walrus (TS SDK or publisher HTTP), severity-tier bounty escrow on Sui |
| Indexer | Optional Rust service in `indexer/` |

---

## Quick start (local dev)

```bash
# 1. Install Sui + Walrus tooling
curl -sSfL https://raw.githubusercontent.com/Mystenlabs/suiup/main/install.sh | sh
suiup install sui
suiup install walrus
suiup install site-builder@testnet

# 2. Get a Testnet wallet funded with SUI + WAL
sui client faucet
walrus get-wal

# 3. Publish the Move contracts
cd contracts && sui client publish --gas-budget 200000000 --json
# Copy the package ID into app/.env.local as VITE_PACKAGE_ID

# 4. Run the frontend
cd ../app && npm install
cp .env.example .env.local        # then edit with your IDs
npm run dev                       # http://localhost:5173

# 5. Optional: run the Enoki sponsor backend
cd ../services/enoki-sponsor && npm install && npm run dev
```

Required environment variables (in `app/.env.local`):

```env
VITE_SUI_NETWORK=testnet
VITE_PACKAGE_ID=0x...              # from step 3
VITE_ENOKI_PUBLIC_API_KEY=...
VITE_ENOKI_GOOGLE_CLIENT_ID=...
VITE_ENOKI_SPONSOR_URL=http://127.0.0.1:8787
VITE_SUPABASE_URL=https://...
VITE_SUPABASE_PUBLISHABLE_KEY=sb_...
```

Run the SQL migration in `app/supabase.sql` once against your Supabase project to create the `forms`, `submissions`, `allowlists`, `submission_events`, and `form_subscriptions` tables with their RLS policies.

---

## Deploy to Walrus Sites

```bash
# Build the SPA
cd app && npm run build           # outputs app/dist/

# First deploy (publishes a new site, writes object_id to dist/ws-resources.json)
site-builder --context=testnet deploy app/dist --epochs 5

# Updates (reads object_id from ws-resources.json automatically)
site-builder --context=testnet deploy app/dist --epochs 5

# Inspect what was uploaded
site-builder sitemap --id <YOUR_OBJECT_ID>
```

Testnet: 1 epoch = 1 day. Mainnet: 1 epoch = 14 days, max 53. Small SPAs (< 1 MB after Vite tree-shake) cost about 0.1 WAL per epoch on Testnet.

For SuiNS-backed human-readable URLs (`yourname.wal.app`), follow the [Walrus Sites + SuiNS guide](https://docs.sui.io/sui-stack/suins/sui-stack-suins) after the first deploy.

---

## Repository layout

```
.
├── app/                          # React/Vite frontend
│   ├── src/
│   │   ├── pages/                # Dashboard, Builder, Admin, Submit, Templates, Allowlists, Settings
│   │   ├── components/           # Form renderer, wallet widget, Walrus blob status
│   │   ├── forms/                # Local + remote persistence, schema types
│   │   ├── walrus/               # Storage client, SUI to WAL exchange, lifecycle
│   │   ├── seal/                 # Encrypt + decrypt with session-key reuse
│   │   ├── enoki/                # Sponsored submission helper
│   │   └── helpers/              # PTB builders, identity nonces
│   ├── tests/e2e/                # Playwright specs
│   └── supabase.sql              # Owner-scoped RLS schema
├── contracts/                    # Sui Move package
│   └── sources/
│       ├── form_registry.move    # Form + Allowlist creation, update, close
│       ├── submission.move       # Submission shared object + status events
│       ├── triage.move           # Owner-only state machine
│       ├── seal_policies.move    # Allowlist + token-gated + timelock approve fns
│       └── reputation.move       # Soulbound SubmissionReceipt mint
├── indexer/                      # Optional Rust indexer (events to Postgres)
└── services/
    ├── enoki-sponsor/            # Hono backend that signs sponsored Submission PTBs
    └── webhook-forwarder/        # Slack / Discord / Linear webhook fanout
```

---

## License

MIT. Built for and during the Walrus Session 2 hackathon, May 5-18 2026.
