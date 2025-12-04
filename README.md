# AINTIVIRUS

Browser extension that blocks trackers, defeats fingerprinting, and keeps your Solana wallet secure—all in one package.

## What It Does

### 🛡️ Privacy Protection

Blocks invasive tracking using industry-standard filter lists (EasyList, EasyPrivacy, uBlock filters). Automatically deletes tracking cookies when tabs close, strips tracking parameters from URLs, and sends Global Privacy Control signals to sites that respect it.

Per-site controls let you dial protection up (strict mode) or down (trusted sites) depending on the context.

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
└── wallet/         # Solana wallet (keys, transactions, tokens)
```

## Requirements

- Node.js 18+
- npm 9+

## License

MIT
