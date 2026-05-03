---
title: LazyTrader Android Dev Setup
description: How to develop LazyTrader on a Mac while testing live on a physical Android phone over Tailscale, using Expo dev client + EAS Build, with Phantom/Solflare for wallet flows.
type: dev-setup
project: lazytrader
version: 1.0
status: draft
phase: hackathon-mvp
date: 2026-05-03
created: 2026-05-03
tags: [android, dev-setup, tailscale, expo, eas, mwa]
---

# LazyTrader — Android Dev Setup

How to develop on Mac and test live on a physical Android phone via Tailscale.

**Related docs**: [[PRD]] · [[ARCHITECTURE]] · [[IMPLEMENTATION-PLAN]] · [[SMC-ENGINE-VALIDATION]]

---

## Why this setup

- **React Native + native modules** (ML Kit, ExecuTorch, MWA) → can't use Expo Go
- **Expo Dev Client + EAS Build** → custom dev build with all native modules; hot-reload in JS layer without rebuilding the native shell
- **Tailscale** → Mac and phone on a stable mesh network; works across WiFi changes, mobile data, anywhere
- **ADB over Tailscale** → wireless install + debug

## One-time setup

### Mac

| Tool | Install |
|------|--------|
| Node 22+ | `nvm install 22 && nvm use 22` |
| pnpm | `npm install -g pnpm` |
| Java 17 | `brew install --cask temurin@17` |
| Android Studio | `brew install --cask android-studio` (then run, install SDK + platform-tools) |
| Expo CLI | bundled — use `npx expo` |
| EAS CLI | `pnpm add -g eas-cli && eas login` |
| Tailscale | already installed |

Add to `~/.zshrc`:
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
```

### Phone (Android)

1. Settings → About phone → tap "Build number" 7 times to enable Developer Options
2. Developer Options → enable USB debugging
3. Developer Options → enable Wireless debugging (Android 11+)
4. Install Tailscale app, sign in to same account as Mac
5. Install Phantom from Play Store, create or import a wallet
6. Install Solflare from Play Store, create or import a wallet (for testing fallback)
7. Fund both wallets on Solana devnet (https://faucet.solana.com)

### Phone ↔ Mac trust

**First time only**, plug phone into Mac via USB:

```bash
adb devices
# accept the trust prompt on phone
adb tcpip 5555
```

Then unplug. Get phone's Tailscale IP (Tailscale app → My devices → tap phone) and:

```bash
adb connect <phone-tailscale-ip>:5555
adb devices
# should show: <phone-ip>:5555  device
```

This survives across networks because Tailscale gives both devices a stable IP.

## Project setup (when M1 starts)

```bash
cd ~/lazytrader-app
npx create-expo-app . --template blank-typescript

# Configure Expo for dev client
pnpm add expo-dev-client
pnpm add -D @types/react @types/react-native

# Core deps
pnpm add zustand zod @react-native-async-storage/async-storage

# Camera + OCR
pnpm add react-native-vision-camera @react-native-ml-kit/text-recognition

# On-device LLM
pnpm add react-native-executorch

# Wallet + Solana
pnpm add @solana-mobile/wallet-adapter-mobile @solana/web3.js @drift-labs/sdk
```

### Configure `app.json`

```json
{
  "expo": {
    "name": "LazyTrader",
    "slug": "lazytrader",
    "android": {
      "package": "live.lazytrader",
      "permissions": [
        "android.permission.CAMERA",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.INTERNET"
      ]
    },
    "platforms": ["android"],
    "plugins": [
      "expo-dev-client",
      "react-native-vision-camera"
    ]
  }
}
```

### Configure `eas.json`

```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    }
  }
}
```

## Daily dev loop

### Cold start (first build of the day or after native dep change)

```bash
cd ~/lazytrader-app

# Build the dev client APK (one-time per native dep change, ~10 min)
eas build --profile development --platform android --local
# OR cloud:
eas build --profile development --platform android

# Install on phone over Tailscale
adb -s <phone-ip>:5555 install ./build-output.apk
```

### Hot dev loop (rest of the day)

```bash
# 1. Start dev server bound to Tailscale IP
TAILSCALE_IP=$(tailscale ip -4 | head -1)
REACT_NATIVE_PACKAGER_HOSTNAME=$TAILSCALE_IP npx expo start --dev-client

# 2. Scan QR from terminal with phone (it points to your Tailscale IP)
#    OR: open the LazyTrader Dev Client app on phone, paste exp://$TAILSCALE_IP:8081
```

Edit code on Mac → save → app hot-reloads on phone. No USB needed.

### Convenience script

Save as `~/lazytrader-app/scripts/dev.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
TAILSCALE_IP=$(tailscale ip -4 | head -1)
echo "Dev server binding to Tailscale IP: $TAILSCALE_IP"
adb connect "${PHONE_TAILSCALE_IP:-}:5555" 2>/dev/null || true
REACT_NATIVE_PACKAGER_HOSTNAME=$TAILSCALE_IP npx expo start --dev-client
```

Then: `PHONE_TAILSCALE_IP=100.x.y.z bash scripts/dev.sh`

## Debugging

| Need | Tool |
|------|------|
| JS console logs | Built into Expo dev tools (terminal) |
| React DevTools | `npx react-devtools` on Mac |
| Network inspection | Flipper or react-native-debugger |
| Native logs | `adb -s <phone>:5555 logcat \| grep -i lazytrader` |
| Tx inspection | Solana Explorer with Drift devnet preset |

## Common issues

**"Unable to connect to dev server"**
- Verify Tailscale is up on both devices: `tailscale status` on Mac, app on phone
- `adb connect <phone-ip>:5555` to confirm reachability
- Some Android battery savers kill background WebSockets — disable for the dev client app

**"Trust this computer" prompt re-appears**
- USB debugging trust resets on revoke. Plug in via USB once and re-accept.

**ML Kit / ExecuTorch crashes on launch**
- Native modules require a fresh dev build. After adding any native dep: `eas build --profile development --platform android` again.

**Phantom doesn't open from MWA**
- Phantom must be installed on the same device as the dev client
- Confirm Phantom is set to devnet for testing
- If wallet returns generic error, restart both apps and reconnect Tailscale

## Wallet setup for testing

Devnet faucet for SOL:
```bash
solana airdrop 2 <your-devnet-pubkey> --url devnet
```

Drift devnet UI: https://app.beta.drift.trade

## Tailscale notes

- Both devices auto-reconnect after sleep
- Works on cellular (phone on 5G, Mac on WiFi) — same Tailscale IPs
- Exit nodes / subnet routing not required for this workflow
- If a device shows offline, restart the Tailscale app on that device
