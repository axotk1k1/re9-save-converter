# 🎮 RE9 Save Converter (Resident Evil Requiem PC ⇄ PS5)

[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20(WSL)-blue.svg)]()
[![Game](https://img.shields.io/badge/Game-Resident%20Evil%20Requiem-red.svg)]()
[![Engine](https://img.shields.io/badge/Engine-RE%20Engine%20(Mandarin%20Crypto)-orange.svg)]()
[![PS5 Tool](https://img.shields.io/badge/PS5-Garlic%20SaveMgr%20Compatible-green.svg)]()

A complete, foolproof GUI and CLI toolsuite to convert and re-sign **Resident Evil Requiem** save files between **PC (Steam / GSE Saves)** and **PlayStation 5 (Garlic SaveMgr)**.

---

## ✨ Key Features

- 🔄 **Bidirectional & Multi-Mode Conversion:**
  - **PC ➔ PS5:** Decrypts Steam PC save, patches PS5 platform metadata (`_MainRegionHash`, `_ApplicationVersion`), and re-encrypts with PS5 Mandarin cryptographic keys.
  - **PS5 ➔ PC:** Decrypts Garlic SaveMgr PS5 dump, restores PC Steam metadata, and re-encrypts with your target SteamID64.
  - **PC ➔ PC:** Transfer saves between different Steam accounts or emulator saves with one click.
- 🛡️ **Fixes the "New Game Only" / Greyed-out Continue Bug:**
  - Automatically identifies and updates `app.GameSaveSlotHeader` fields (`_MainRegionHash = 3208943443`, `_ApplicationVersion = 16785408`), allowing PS5 to recognize PC saves as authentic native saves.
- 📦 **Universal Input Support:**
  - Drag-and-drop or select single `.bin` files (`data000.bin`, `data001Slot.bin`).
  - Drop full folders or compressed archives (`.zip`, `.rar`, `.7z`, `.tar.gz`).
  - Automatic PC save path auto-detection (Heroic / Wine / Steam prefix).
- 📡 **Garlic SaveMgr Network Integration:**
  - Live console ping and status display for PS5 Garlic SaveMgr HTTP server (`http://<ip>:8082`).
- 🎨 **Modern Glassmorphic Dark UI:**
  - Real-time conversion logs, slot badge inspection (SSSD / Mandarin format verification, file sizes, timestamps).
- 🚀 **Precompiled Linux Binary Included:**
  - Works out of the box without needing to install Rust or build dependencies.

---

## 📸 Overview

| Mode | Source | Target | Encryption |
| :--- | :--- | :--- | :--- |
| **PC ➔ PS5** | SteamID64 (e.g. `76561197960285355`) | PS5 RE9 Key (`394424879635983`) | Blowfish + Mandarin |
| **PS5 ➔ PC** | PS5 RE9 Key (`394424879635983`) | Custom SteamID64 | Blowfish + SteamID |
| **PC ➔ PC** | Old SteamID64 | New SteamID64 | Blowfish + SteamID |

---

## 🚀 Quick Start

### 1. Launch via Desktop Shortcut
Double-click `RE9 Save Converter` on your desktop, or run the launcher script:
```bash
./launch.sh
```
The server will start at `http://127.0.0.1:8765` and launch as an app window.

### 2. Manual Start (Python)
```bash
python3 server.py
```
Then open [http://127.0.0.1:8765](http://127.0.0.1:8765) in any modern browser.

---

## 🛠️ CLI Usage (Standalone)

The compiled backend converter is located in `bin/convert_re9_ps5`.

```bash
# Syntax:
# ./bin/convert_re9_ps5 <input_path> <output_path> <source_id> [target_id] [mode] [ps5_region_hash] [ps5_app_version]

# Convert PC save to PS5:
./bin/convert_re9_ps5 data000.bin ps5_out/ 76561197960285355 394424879635983 pc2ps5 3208943443 16785408

# Convert PS5 save to PC:
./bin/convert_re9_ps5 data000.bin pc_out/ 394424879635983 76561197960285355 ps52pc 1874947740 16781314
```

---

## 🔬 Technical Background

### Resident Evil Requiem Encryption & Header Quirks
1. **Mandarin Encryption Flag (`0x10`):**
   RE9 introduces the **Mandarin** crypto scheme. The save format wraps RSZ payloads into SSSD containers with 64-bit alignment and Murmur3 hashes.
2. **Region Hash & Version Check:**
   Native PS5 firmware refuses PC saves if `app.GameSaveSlotHeader` contains the PC region hash (`1874947740` / `0x6fc16e9c`) or PC build version (`16781314` / `v1.0.1.2`). This converter automatically replaces them with PS5 hashes (`3208943443` / `0xbf449753`) and version (`16785408` / `v1.0.2.0`).
3. **Save Files Breakdown:**
   - `data000.bin`: Main Autosave / "Continue" slot.
   - `data001Slot.bin` - `data099Slot.bin`: Manual slot saves.
   - `data00-1.bin`: System settings (graphics, controls, volume). *Keep your console's native `data00-1.bin`.*

---

## 📁 Repository Structure

```
├── bin/
│   └── convert_re9_ps5          # Standalone release binary (Linux x86_64)
├── rust-source/
│   └── convert_re9_ps5.rs       # Rust converter source code
├── static/
│   ├── index.html               # Web UI layout
│   ├── style.css                # Dark modern styling
│   └── app.js                   # Client interactions & REST API calls
├── launch.sh                    # One-click desktop launcher
├── RE9_Save_Converter.desktop   # Linux Desktop Entry file
├── server.py                    # Lightweight Python HTTP server & API
└── README.md
```

---

## ⚖️ License
Released for educational and backup purposes. Resident Evil and RE Engine are trademarks of Capcom Co., Ltd.
