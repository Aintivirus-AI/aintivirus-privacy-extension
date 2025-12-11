# AINTIVIRUS

Browser extension that blocks trackers, defeats fingerprinting, and keeps your Solana wallet secure—all in one package.

## What It Does

### 🛡️ Privacy Protection

Blocks invasive tracking using industry-standard filter lists powered by **Aintivirus Adblocker** technology. This includes EasyList, EasyPrivacy, Aintivirus filters, Peter Lowe's List, and malware/badware protection lists.

The extension uses Chrome's Manifest V3 declarativeNetRequest API for high-performance, privacy-respecting ad and tracker blocking. No remote code execution, no data collection.

Additional privacy features:

- Automatic tracking cookie cleanup when tabs close
- URL tracking parameter stripping
- Global Privacy Control (GPC) signal support
- Per-site allowlisting for trusted sites

### 🎭 Anti-Fingerprinting

Websites can uniquely identify you through browser fingerprinting—canvas rendering, WebGL, screen resolution, audio context, hardware specs, etc. This extension injects noise into those APIs so your fingerprint changes per-session and per-domain, making cross-site tracking much harder.

Spoofed properties include:

- Canvas and WebGL rendering
- Screen dimensions
- Audio context
- Hardware concurrency and device memory
- Client hints, plugins, and language settings

### 💰 Solana Wallet

Built-in non-custodial wallet for Solana. Create new wallets or import existing ones via seed phrase. Private keys are encrypted with your password and never leave the extension.

Features:

- Send and receive SOL
- View transaction history
- Manage SPL tokens
- QR code generation for receiving
- Mainnet and Devnet support
- Auto-lock after inactivity

### 🔒 Security Monitoring

Tracks which sites have connected to your wallet and lets you revoke access. Analyzes transactions before signing and warns about risky operations. Detects known phishing domains and suspicious smart contracts.

Note: Security analysis is heuristic-based and informational only—always verify transactions yourself.

## Installation

### Chrome

```bash
npm install
npm run build
```

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/` folder

### Firefox

```bash
npm run build:firefox
```

1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in `dist/`

## Development

### Build-time secrets

- This project expects certain values to be **injected at build time** (CI env vars or a local `.env` file).
- Do **not** commit real secrets. `.env` and `.env.*` are ignored by git.
- See `env.example` for the expected variable names.

```bash
npm run dev    # Watch mode with auto-rebuild
npm run build  # Production build
npm run clean  # Remove dist folder
```

## Project Structure

```
src/
├── background/     # Service worker (message routing, module coordination)
├── content/        # Injected into pages
├── fingerprinting/ # API spoofing for anti-fingerprinting
├── popup/          # Toolbar popup UI (React)
├── privacy/        # Tracker blocking, cookie management, filter lists
├── security/       # Phishing detection, transaction analysis
├── settings/       # Full settings page (React)
├── shared/         # Storage, messaging, types
├── aintivirusAdblocker/ # Aintivirus Adblocker integration (GPL-3.0)
└── wallet/         # Solana wallet (keys, transactions, tokens)

vendor/
└── aintivirusAdblocker/ # Upstream assets that power the Aintivirus Adblocker engine (GPL-3.0 licensed)
    ├── js/         # JavaScript modules and content scripts
    ├── rulesets/   # Pre-compiled DNR rulesets from filter lists
    └── web_accessible_resources/  # Redirect resources
```

## Requirements

- Node.js 18+
- npm 9+

## License

This project includes components under different licenses:

- **Original Aintivirus code:** MIT License
- **Aintivirus Adblocker components:** GNU General Public License v3.0 (GPL-3.0)

Due to GPL-3.0's copyleft requirements, when distributing this extension with the Aintivirus Adblocker components included, the combined work must comply with GPL-3.0 terms.

See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for detailed license information and attributions.

### Aintivirus Adblocker Attribution

This extension incorporates the Aintivirus Adblocker engine—our rebranded, MV3-friendly descendant of uBlock Origin Lite (GPL-3.0).

- Original source: https://github.com/gorhill/uBlock
- uBlock Origin Lite: https://github.com/AmpossibleAdBlocker/uBOL-home
