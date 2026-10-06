#!/usr/bin/env python3
"""
Game Save Converter GUI Server (Multi-Engine: RE Engine & Unreal Engine)
Supports:
- Capcom RE Engine (Resident Evil Requiem, RE4, etc. - SSSD Mandarin crypto)
- Hazelight Unreal Engine (Split Fiction - SaveData.Split <-> ue4savegame.dpx.sav)
- Direct Garlic SaveMgr (PS5) synchronization
"""

import os
import sys
import json
import time
import shutil
import urllib.parse
import urllib.request
import subprocess
import zipfile
import tarfile
from pathlib import Path
import http.server
import socketserver

PORT = 8765
BASE_DIR = Path(__file__).parent.resolve()
STATIC_DIR = BASE_DIR / "static"
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_RE_DIR = Path(
    os.path.expanduser(
        "~/Games/Heroic/Prefixes/default/RESIDENT EVIL requiem/drive_c/users/steamuser/AppData/Roaming/GSE Saves/3764200/remote/win64_save"
    )
)
DEFAULT_SF_DIR = Path(os.path.expanduser("~/Desktop/SplitFiction"))
DEFAULT_OUTPUT_DIR = Path(os.path.expanduser("~/Desktop/PS5_READY_SAVES"))

# RE Engine defaults
DEFAULT_STEAM_ID = "76561197960285355"
DEFAULT_PS5_RE_ID = "394424879635983"
DEFAULT_RE_TITLE_ID = "PPSA30803"
DEFAULT_RE_REGION_HASH = "3208943443"
DEFAULT_RE_APP_VERSION = "16785408"

# Unreal Engine (Split Fiction) defaults
DEFAULT_PC_UID = "8A67AD3A491F308AB1BBD2AB12E76E39"
DEFAULT_PS5_UID = "813EB9976BF84E3FAB6AF0C68048B4F6"
DEFAULT_SF_TITLE_ID = "PPSA08560"

LOCAL_BIN = BASE_DIR / "bin" / "convert_re9_ps5"
DEV_RELEASE_BIN = Path("/home/axotn1k1/vscode/ree-save-editor/target/release/convert_re9_ps5")
DEV_DEBUG_BIN = Path("/home/axotn1k1/vscode/ree-save-editor/target/debug/convert_re9_ps5")

if LOCAL_BIN.exists():
    CONVERTER_BIN = LOCAL_BIN
elif DEV_RELEASE_BIN.exists():
    CONVERTER_BIN = DEV_RELEASE_BIN
elif DEV_DEBUG_BIN.exists():
    CONVERTER_BIN = DEV_DEBUG_BIN
else:
    CONVERTER_BIN = LOCAL_BIN


def inspect_save_file(file_path: Path) -> dict:
    """Inspects a save file and detects whether it is RE Engine or Unreal Engine."""
    try:
        size = file_path.stat().st_size
        mtime = file_path.stat().st_mtime
        mtime_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(mtime))
        size_str = f"{size / 1024:.1f} KB" if size < 1024 * 1024 else f"{size / (1024 * 1024):.2f} MB"

        with open(file_path, "rb") as f:
            header = f.read(512)

        name_lower = file_path.name.lower()

        # 1. Check RE Engine (SSSD / DSSS / Blowfish encrypted)
        is_re_engine = False
        re_type = "Manual Slot"
        if header[:4] in (b"SSSD", b"DSSS") or (len(header) >= 16 and (header[0] in (1, 2) or header[8:12] == b"SSSD")):
            is_re_engine = True
        elif name_lower.endswith(".bin") and ("data0" in name_lower or "slot" in name_lower):
            is_re_engine = True

        if is_re_engine:
            if "00-1" in file_path.name:
                re_type = "System (Настройки)"
            elif "000" in file_path.name:
                re_type = "Автосохранение (Продолжить)"
            else:
                re_type = "Слот сохранения"

            return {
                "name": file_path.name,
                "path": str(file_path),
                "size": size,
                "size_str": size_str,
                "mtime": mtime,
                "mtime_str": mtime_str,
                "engine": "re_engine",
                "engine_label": "RE Engine (Capcom)",
                "game": "Resident Evil Requiem",
                "is_valid": True,
                "type": re_type,
                "recommended_target_name": "data000.bin" if "000" in file_path.name else file_path.name,
                "meta": {}
            }

        # 2. Check Unreal Engine (Hazelight / Split Fiction or GVAS)
        if header[:4] == b"GVAS":
            return {
                "name": file_path.name,
                "path": str(file_path),
                "size": size,
                "size_str": size_str,
                "mtime": mtime,
                "mtime_str": mtime_str,
                "engine": "unreal_engine",
                "engine_label": "Unreal Engine (GVAS .sav)",
                "game": "Unreal Engine Game",
                "is_valid": True,
                "type": "UE GVAS Save",
                "recommended_target_name": file_path.name,
                "meta": {}
            }

        # Check Hazelight JSON (.Split or ue4savegame.dpx.sav or JSON)
        is_split = False
        split_meta = {}
        split_type = "Split Fiction Save"
        recommended_target = "ue4savegame.dpx.sav"

        try:
            text = header.decode("utf-8", errors="ignore").strip()
            if text.startswith("{"):
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    data = json.load(f)

                # PC SaveData.Split format
                if "FurthestUnlockedChapter" in data or ("UID" in data and "EULA_Accepted" in data):
                    is_split = True
                    split_type = "ПК Сохранение (SaveData.Split)"
                    recommended_target = "ue4savegame.dpx.sav"
                    split_meta = {
                        "uid": data.get("UID", ""),
                        "chapter": data.get("LastSaveChapter", "").split("/")[-1].replace("##", " - "),
                        "checkpoint": data.get("LastSaveProgressPoint", "").split("/")[-1].replace("##", " - "),
                        "jumps": data.get("ProfileCounter.TotalJumps", "0"),
                        "raw_profile": data
                    }

                # PS5 ue4savegame.dpx.sav format
                elif "Profile" in data and isinstance(data.get("Profile"), dict):
                    is_split = True
                    prof = data["Profile"]
                    split_type = "PS5 Сохранение (ue4savegame.dpx.sav)"
                    recommended_target = "SaveData.Split"
                    split_meta = {
                        "uid": prof.get("UID", ""),
                        "chapter": prof.get("LastSaveChapter", "").split("/")[-1].replace("##", " - "),
                        "checkpoint": prof.get("LastSaveProgressPoint", "").split("/")[-1].replace("##", " - "),
                        "jumps": prof.get("ProfileCounter.TotalJumps", "0"),
                        "raw_profile": prof
                    }
        except Exception:
            pass

        if is_split or name_lower.endswith(".split") or name_lower == "ue4savegame.dpx.sav":
            return {
                "name": file_path.name,
                "path": str(file_path),
                "size": size,
                "size_str": size_str,
                "mtime": mtime,
                "mtime_str": mtime_str,
                "engine": "unreal_engine",
                "engine_label": "Unreal Engine (Split Fiction)",
                "game": "Split Fiction",
                "is_valid": True,
                "type": split_type,
                "recommended_target_name": recommended_target,
                "meta": split_meta
            }

        # Fallback unknown file
        return {
            "name": file_path.name,
            "path": str(file_path),
            "size": size,
            "size_str": size_str,
            "mtime": mtime,
            "mtime_str": mtime_str,
            "engine": "unknown",
            "engine_label": "Неизвестный файл",
            "game": "Unknown",
            "is_valid": False,
            "type": "Unknown",
            "recommended_target_name": file_path.name,
            "meta": {}
        }
    except Exception as e:
        return {
            "name": file_path.name,
            "path": str(file_path),
            "size": 0,
            "size_str": "0 KB",
            "mtime": 0,
            "mtime_str": "-",
            "engine": "unknown",
            "engine_label": "Ошибка",
            "game": "Unknown",
            "is_valid": False,
            "error": str(e),
            "type": "Error",
            "recommended_target_name": file_path.name,
            "meta": {}
        }


def scan_saves_in_dir(target_dir: Path):
    """Scans directory for all compatible game saves (RE Engine & Unreal Engine)."""
    game_saves = []
    system_save = None

    if target_dir.exists():
        for root, _, files in os.walk(target_dir):
            for file in files:
                name_l = file.lower()
                # Match RE Engine files (.bin) and Unreal Engine files (.Split, .sav, .json)
                if name_l.endswith((".bin", ".split", ".sav", ".json")):
                    p = Path(root) / file
                    details = inspect_save_file(p)
                    if details.get("type", "").startswith("System"):
                        system_save = details
                    else:
                        game_saves.append(details)

        # Sort latest first
        game_saves.sort(key=lambda s: s.get("mtime", 0), reverse=True)
        if game_saves:
            game_saves[0]["is_latest"] = True

    # Determine dominant engine in directory
    detected_engine = "re_engine"
    detected_game = "Resident Evil Requiem"
    ue_count = sum(1 for s in game_saves if s.get("engine") == "unreal_engine")
    re_count = sum(1 for s in game_saves if s.get("engine") == "re_engine")

    if ue_count > re_count:
        detected_engine = "unreal_engine"
        detected_game = "Split Fiction"

    return game_saves, system_save, detected_engine, detected_game


def convert_unreal_split_save(source_file: Path, output_file: Path, mode: str, source_id: str, target_id: str) -> dict:
    """Converts Split Fiction saves between PC (SaveData.Split) and PS5 (ue4savegame.dpx.sav)."""
    with open(source_file, "r", encoding="utf-8", errors="ignore") as f:
        src_json = json.load(f)

    output_file.parent.mkdir(parents=True, exist_ok=True)

    # PC -> PS5
    if mode == "pc2ps5":
        # Source is PC SaveData.Split or raw Profile
        profile_data = dict(src_json.get("Profile", src_json))
        # Ensure UID is set to target PS5 UID
        ps5_uid = target_id.strip() if target_id and len(target_id.strip()) == 32 else DEFAULT_PS5_UID
        profile_data["UID"] = ps5_uid

        # Build PS5 structure with tabs and \n
        lines = ["{", '\t"Profile":', "\t{"]
        items = list(profile_data.items())
        for idx, (k, v) in enumerate(items):
            comma = "," if idx < len(items) - 1 else ""
            lines.append(f'\t\t"{k}": "{v}"{comma}')
        lines.append("\t},")
        lines.append('\t"CloudSettings":')
        lines.append("\t{")
        lines.append("\t},")
        lines.append('\t"LocalSettings":')
        lines.append("\t{")
        lines.append("\t}")
        lines.append("}\n")

        final_text = "\n".join(lines)
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(final_text)

        chapter = profile_data.get("LastSaveChapter", "")
        chk = profile_data.get("LastSaveProgressPoint", "")
        jumps = profile_data.get("ProfileCounter.TotalJumps", "0")

        return {
            "success": True,
            "output_file": str(output_file),
            "log": (
                f"Успешно сконвертировано (Split Fiction PC -> PS5):\n"
                f"• Исходный файл: {source_file.name}\n"
                f"• Результат: {output_file.name} ({output_file.stat().st_size} байт)\n"
                f"• PS5 UID: {ps5_uid}\n"
                f"• Глава: {chapter}\n"
                f"• Чекпоинт: {chk}\n"
                f"• Прыжков: {jumps}\n"
                f"• Формат: ue4savegame.dpx.sav (готово для записи через Garlic SaveMgr в sdimg_ProfileData)"
            )
        }

    # PS5 -> PC
    elif mode == "ps52pc":
        profile_data = dict(src_json.get("Profile", src_json))
        pc_uid = target_id.strip() if target_id and len(target_id.strip()) == 32 else DEFAULT_PC_UID
        profile_data["UID"] = pc_uid

        final_text = json.dumps(profile_data, indent=4, ensure_ascii=False)
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(final_text)

        return {
            "success": True,
            "output_file": str(output_file),
            "log": (
                f"Успешно сконвертировано (Split Fiction PS5 -> PC):\n"
                f"• Исходный файл: {source_file.name}\n"
                f"• Результат: {output_file.name}\n"
                f"• ПК UID: {pc_uid}\n"
                f"• Сохранено для ПК в формате SaveData.Split"
            )
        }

    # PC -> PC
    else:
        profile_data = dict(src_json.get("Profile", src_json))
        if target_id:
            profile_data["UID"] = target_id

        final_text = json.dumps(profile_data, indent=4, ensure_ascii=False)
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(final_text)

        return {
            "success": True,
            "output_file": str(output_file),
            "log": f"Успешно обновлен профиль (PC -> PC): UID = {profile_data.get('UID')}"
        }


class AppRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/api/saves":
            dir_param = query.get("dir", [None])[0]
            engine_hint = query.get("engine", ["auto"])[0]

            if dir_param:
                target_dir = Path(dir_param)
            else:
                # If engine hint is unreal_engine or default RE does not exist
                if engine_hint == "unreal_engine" or (not DEFAULT_RE_DIR.exists() and DEFAULT_SF_DIR.exists()):
                    target_dir = DEFAULT_SF_DIR
                else:
                    target_dir = DEFAULT_RE_DIR

            saves, sys_save, detected_engine, detected_game = scan_saves_in_dir(target_dir)

            self.send_json({
                "current_dir": str(target_dir),
                "default_re_dir": str(DEFAULT_RE_DIR),
                "default_sf_dir": str(DEFAULT_SF_DIR),
                "default_output_dir": str(DEFAULT_OUTPUT_DIR),
                "detected_engine": detected_engine,
                "detected_game": detected_game,
                "default_steam_id": DEFAULT_STEAM_ID,
                "default_ps5_re_id": DEFAULT_PS5_RE_ID,
                "default_pc_uid": DEFAULT_PC_UID,
                "default_ps5_uid": DEFAULT_PS5_UID,
                "saves": saves,
                "system_save": sys_save
            })
            return

        elif path == "/api/ps5_status":
            ps5_ip = query.get("ip", ["192.168.1.173"])[0]
            ps5_port = query.get("port", ["8082"])[0]
            ps5_url = f"http://{ps5_ip}:{ps5_port}"
            try:
                req = urllib.request.Request(f"{ps5_url}/api/saves", headers={"User-Agent": "RE9SaveConverter"})
                with urllib.request.urlopen(req, timeout=1.5) as response:
                    data = json.loads(response.read().decode())
                    self.send_json({"online": True, "url": ps5_url, "data": data})
            except Exception as e:
                self.send_json({"online": False, "url": ps5_url, "error": str(e)})
            return

        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        content_length = int(self.headers.get("Content-Length", 0))

        # Handle File / Archive upload
        if path == "/api/upload":
            filename = query.get("name", ["uploaded_file.bin"])[0]
            filename = os.path.basename(filename)
            payload = self.rfile.read(content_length)

            dest_path = UPLOAD_DIR / filename
            with open(dest_path, "wb") as f:
                f.write(payload)

            lower_name = filename.lower()
            unpacked_dir = None

            # Unpack archives
            if lower_name.endswith((".zip", ".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tar.xz", ".7z", ".rar")):
                unpacked_dir = UPLOAD_DIR / f"unpacked_{Path(filename).stem}_{int(time.time())}"
                unpacked_dir.mkdir(parents=True, exist_ok=True)

                if lower_name.endswith(".zip"):
                    with zipfile.ZipFile(dest_path, "r") as zf:
                        zf.extractall(unpacked_dir)
                elif any(lower_name.endswith(ext) for ext in [".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tar.xz"]):
                    with tarfile.open(dest_path, "r:*") as tf:
                        tf.extractall(unpacked_dir)
                elif lower_name.endswith((".7z", ".rar")):
                    subprocess.run(["7z", "x", f"-o{unpacked_dir}", str(dest_path), "-y"], capture_output=True)

                saves, sys_save, detected_engine, detected_game = scan_saves_in_dir(unpacked_dir)
                self.send_json({
                    "success": True,
                    "is_archive": True,
                    "current_dir": str(unpacked_dir),
                    "detected_engine": detected_engine,
                    "detected_game": detected_game,
                    "saves": saves,
                    "system_save": sys_save
                })
                return
            else:
                # Single file
                details = inspect_save_file(dest_path)
                details["is_latest"] = True
                self.send_json({
                    "success": True,
                    "is_archive": False,
                    "current_dir": str(UPLOAD_DIR),
                    "detected_engine": details.get("engine", "re_engine"),
                    "detected_game": details.get("game", "Resident Evil Requiem"),
                    "saves": [details],
                    "system_save": None
                })
                return

        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
        req_data = json.loads(body) if body else {}

        if path == "/api/convert":
            source_file = Path(req_data.get("source_file", ""))
            mode = req_data.get("mode", "pc2ps5")  # pc2ps5, pc2pc, ps52pc
            engine = req_data.get("engine", "auto")

            if not source_file.exists():
                self.send_json({"success": False, "error": f"Файл не найден: {source_file}"})
                return

            file_info = inspect_save_file(source_file)
            actual_engine = file_info.get("engine", "re_engine") if engine == "auto" else engine

            output_dir = Path(req_data.get("output_dir", str(DEFAULT_OUTPUT_DIR)))
            game_id = req_data.get("game_id", "").strip()
            use_game_folder = req_data.get("use_game_folder", False)
            if use_game_folder and game_id:
                output_dir = output_dir / game_id
            output_dir.mkdir(parents=True, exist_ok=True)

            # Determine target filename
            target_name = req_data.get("target_name", "")
            if not target_name:
                if actual_engine == "unreal_engine":
                    target_name = "ue4savegame.dpx.sav" if mode == "pc2ps5" else "SaveData.Split"
                else:
                    target_name = "data000.bin"

            output_file = output_dir / target_name

            # ── UNREAL ENGINE CONVERSION ──
            if actual_engine == "unreal_engine":
                source_id = str(req_data.get("source_id", DEFAULT_PC_UID))
                target_id = str(req_data.get("target_id", DEFAULT_PS5_UID))
                res = convert_unreal_split_save(source_file, output_file, mode, source_id, target_id)
                self.send_json({
                    "success": res.get("success", True),
                    "engine": "unreal_engine",
                    "output_file": str(output_file),
                    "output_dir": str(output_dir),
                    "mode": mode,
                    "log": res.get("log", "")
                })
                return

            # ── RE ENGINE CONVERSION ──
            else:
                source_id = str(req_data.get("source_id", DEFAULT_STEAM_ID))
                target_id = str(req_data.get("target_id", DEFAULT_PS5_RE_ID))
                region_hash = str(req_data.get("region_hash", DEFAULT_RE_REGION_HASH))
                app_version = str(req_data.get("app_version", DEFAULT_RE_APP_VERSION))

                converter = CONVERTER_BIN
                cmd = [str(converter), str(source_file), str(output_file), source_id, target_id, mode, region_hash, app_version]
                try:
                    p = subprocess.run(cmd, capture_output=True, text=True, check=True)
                    self.send_json({
                        "success": True,
                        "engine": "re_engine",
                        "output_file": str(output_file),
                        "output_dir": str(output_dir),
                        "mode": mode,
                        "log": p.stdout
                    })
                except subprocess.CalledProcessError as e:
                    self.send_json({
                        "success": False,
                        "engine": "re_engine",
                        "error": f"Ошибка конвертации RE Engine (код {e.returncode})",
                        "log": e.stdout + "\n" + e.stderr
                    })
                return

        elif path == "/api/convert_batch":
            source_dir = Path(req_data.get("source_dir", str(DEFAULT_RE_DIR)))
            output_dir = Path(req_data.get("output_dir", str(DEFAULT_OUTPUT_DIR)))
            mode = req_data.get("mode", "pc2ps5")
            engine = req_data.get("engine", "auto")
            game_id = req_data.get("game_id", "").strip()
            use_game_folder = req_data.get("use_game_folder", False)

            if use_game_folder and game_id:
                output_dir = output_dir / game_id
            output_dir.mkdir(parents=True, exist_ok=True)

            saves, _, detected_engine, _ = scan_saves_in_dir(source_dir)
            actual_engine = detected_engine if engine == "auto" else engine

            logs = []
            if actual_engine == "unreal_engine":
                source_id = str(req_data.get("source_id", DEFAULT_PC_UID))
                target_id = str(req_data.get("target_id", DEFAULT_PS5_UID))
                for s in saves:
                    sp = Path(s["path"])
                    tname = "ue4savegame.dpx.sav" if mode == "pc2ps5" else "SaveData.Split"
                    out_f = output_dir / tname
                    r = convert_unreal_split_save(sp, out_f, mode, source_id, target_id)
                    logs.append(r.get("log", ""))
            else:
                source_id = str(req_data.get("source_id", DEFAULT_STEAM_ID))
                target_id = str(req_data.get("target_id", DEFAULT_PS5_RE_ID))
                region_hash = str(req_data.get("region_hash", DEFAULT_RE_REGION_HASH))
                app_version = str(req_data.get("app_version", DEFAULT_RE_APP_VERSION))

                converter = CONVERTER_BIN
                cmd = [str(converter), str(source_dir), str(output_dir), source_id, target_id, mode, region_hash, app_version]
                try:
                    p = subprocess.run(cmd, capture_output=True, text=True, check=True)
                    logs.append(p.stdout)
                except subprocess.CalledProcessError as e:
                    self.send_json({
                        "success": False,
                        "error": f"Ошибка пакетной конвертации RE Engine (код {e.returncode})",
                        "log": e.stdout + "\n" + e.stderr
                    })
                    return

            self.send_json({
                "success": True,
                "engine": actual_engine,
                "output_dir": str(output_dir),
                "mode": mode,
                "log": "\n".join(logs)
            })
            return

        elif path == "/api/upload_to_ps5":
            ps5_ip = req_data.get("ip", "192.168.1.173")
            ps5_port = req_data.get("port", "8082")
            file_path = Path(req_data.get("file_path", ""))
            engine = req_data.get("engine", "auto")

            if not file_path.exists():
                self.send_json({"success": False, "error": f"Файл не найден: {file_path}"})
                return

            base_url = f"http://{ps5_ip}:{ps5_port}"
            try:
                # 1. Fetch saves from console
                with urllib.request.urlopen(f"{base_url}/api/saves", timeout=2.0) as resp:
                    data = json.loads(resp.read().decode())
                all_saves = data.get("saves", [])

                # 2. Determine slot index
                # If Unreal Engine / Split Fiction -> find PPSA08560
                # If RE Engine -> find PPSA30803
                target_title_id = "PPSA08560" if engine == "unreal_engine" or "ue4savegame" in file_path.name else "PPSA30803"
                target_idx = None

                for idx, s in enumerate(all_saves):
                    if s.get("title_id") == target_title_id and not s.get("backup", False):
                        if s.get("uid") == "10fd1069" or "axotn1k1" in s.get("path", ""):
                            target_idx = idx
                            break
                        if target_idx is None:
                            target_idx = idx

                if target_idx is None:
                    self.send_json({"success": False, "error": f"Слот для Title ID {target_title_id} не найден на PS5"})
                    return

                # 3. Mount save
                with urllib.request.urlopen(f"{base_url}/api/mount?idx={target_idx}", timeout=3.0) as resp:
                    mount_res = json.loads(resp.read().decode())

                # 4. Upload file
                with open(file_path, "rb") as f:
                    file_bytes = f.read()

                upload_url = f"{base_url}/api/upload_file?name={urllib.parse.quote(file_path.name)}"
                req = urllib.request.Request(upload_url, data=file_bytes, headers={"Content-Type": "application/octet-stream"})
                with urllib.request.urlopen(req, timeout=5.0) as resp:
                    up_res = json.loads(resp.read().decode())

                # 5. Unmount
                with urllib.request.urlopen(f"{base_url}/api/unmount", timeout=3.0) as resp:
                    unm_res = json.loads(resp.read().decode())

                self.send_json({
                    "success": True,
                    "target_title_id": target_title_id,
                    "target_idx": target_idx,
                    "uploaded_file": file_path.name,
                    "mount_info": mount_res,
                    "upload_info": up_res
                })
            except Exception as e:
                # Always attempt unmount on error
                try:
                    urllib.request.urlopen(f"{base_url}/api/unmount", timeout=1.0)
                except Exception:
                    pass
                self.send_json({"success": False, "error": str(e)})
            return

        elif path == "/api/open_folder":
            folder = req_data.get("folder", str(DEFAULT_OUTPUT_DIR))
            try:
                subprocess.Popen(["xdg-open", folder])
                self.send_json({"success": True})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)})
            return

        self.send_error(404, "Endpoint not found")

    def send_json(self, data, status=200):
        try:
            body = json.dumps(data).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            sys.stderr.write(f"Error sending json response: {e}\n")


class ReusableThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    print(f"=== Multi-Engine Save Converter Server ===")
    print(f"Listening on: http://127.0.0.1:{PORT}")
    print(f"Supported Engines: RE Engine (Capcom) & Unreal Engine (Split Fiction / GVAS)")
    with ReusableThreadingServer(("127.0.0.1", PORT), AppRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")


if __name__ == "__main__":
    main()
