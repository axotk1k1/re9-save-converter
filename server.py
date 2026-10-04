#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import subprocess
import struct
import time
import zipfile
import tarfile
import shutil
import urllib.request
import urllib.parse
from pathlib import Path

PORT = 8765
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
UPLOAD_DIR = Path("/tmp/re9_uploaded_saves")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_PC_SAVE_DIR = Path(
    os.path.expanduser(
        "~/Games/Heroic/Prefixes/default/RESIDENT EVIL requiem/drive_c/users/steamuser/AppData/Roaming/GSE Saves/3764200/remote/win64_save"
    )
)
DEFAULT_OUTPUT_DIR = Path(os.path.expanduser("~/Desktop/PS5_READY_SAVES"))
DEFAULT_STEAM_ID = "76561197960285355"
DEFAULT_PS5_ID = "394424879635983"

BASE_DIR = Path(__file__).parent.resolve()
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

def get_save_details(file_path: Path):
    try:
        size = file_path.stat().st_size
        mtime = file_path.stat().st_mtime
        mtime_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(mtime))
        
        with open(file_path, "rb") as f:
            raw = f.read(128)
        
        is_sssd = raw[:4] == b"DSSS" or raw[:4] == b"SSSD"
        
        save_type = "Manual Slot"
        if "00-1" in file_path.name:
            save_type = "System"
        elif "000" in file_path.name:
            save_type = "Autosave (Continue)"
            
        return {
            "name": file_path.name,
            "path": str(file_path),
            "size": size,
            "size_str": f"{size / 1024:.1f} KB" if size < 1024*1024 else f"{size / (1024*1024):.2f} MB",
            "mtime": mtime,
            "mtime_str": mtime_str,
            "is_valid": is_sssd,
            "type": save_type
        }
    except Exception as e:
        return {
            "name": file_path.name,
            "path": str(file_path),
            "size": 0,
            "size_str": "0 KB",
            "mtime": 0,
            "mtime_str": "-",
            "is_valid": False,
            "error": str(e),
            "type": "Unknown"
        }

def scan_saves_in_dir(target_dir: Path):
    game_saves = []
    system_save = None
    if target_dir.exists():
        for root, _, files in os.walk(target_dir):
            for file in files:
                if file.endswith(".bin"):
                    p = Path(root) / file
                    details = get_save_details(p)
                    if details["type"] == "System":
                        system_save = details
                    else:
                        game_saves.append(details)
        
        game_saves.sort(key=lambda s: s.get("mtime", 0), reverse=True)
        if game_saves:
            game_saves[0]["is_latest"] = True
            
    return game_saves, system_save

class AppRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/saves":
            query = urllib.parse.parse_qs(parsed.query)
            target_dir = Path(query.get("dir", [str(DEFAULT_PC_SAVE_DIR)])[0])
            
            exists = target_dir.exists()
            game_saves, system_save = scan_saves_in_dir(target_dir)

            self.send_json({
                "exists": exists,
                "current_dir": str(target_dir),
                "default_dir": str(DEFAULT_PC_SAVE_DIR),
                "default_output_dir": str(DEFAULT_OUTPUT_DIR),
                "default_steam_id": DEFAULT_STEAM_ID,
                "default_ps5_id": DEFAULT_PS5_ID,
                "saves": game_saves,
                "system_save": system_save
            })
            return

        elif path == "/api/ps5_status":
            query = urllib.parse.parse_qs(parsed.query)
            ps5_ip = query.get("ip", ["192.168.1.173:8082"])[0]
            ps5_url = ps5_ip if ps5_ip.startswith("http") else f"http://{ps5_ip}"

            try:
                with urllib.request.urlopen(f"{ps5_url}/api/list_games", timeout=1.5) as r:
                    data = json.loads(r.read().decode())
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
            filename = os.path.basename(filename) # sanitize
            payload = self.rfile.read(content_length)

            dest_path = UPLOAD_DIR / filename
            with open(dest_path, "wb") as f:
                f.write(payload)

            lower_name = filename.lower()
            unpacked_dir = None

            # Handle archives
            if lower_name.endswith((".zip", ".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tar.xz", ".rar", ".7z")):
                timestamp = int(time.time() * 1000)
                unpacked_dir = UPLOAD_DIR / f"unpacked_{timestamp}"
                unpacked_dir.mkdir(parents=True, exist_ok=True)

                try:
                    if lower_name.endswith(".zip"):
                        with zipfile.ZipFile(dest_path, 'r') as zip_ref:
                            zip_ref.extractall(unpacked_dir)
                    elif lower_name.endswith((".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tar.xz")):
                        with tarfile.open(dest_path, 'r:*') as tar_ref:
                            tar_ref.extractall(unpacked_dir)
                    elif lower_name.endswith((".rar", ".7z")):
                        # Use 7z or unrar
                        if shutil.which("7z"):
                            subprocess.run(["7z", "x", f"-o{unpacked_dir}", str(dest_path)], check=True, capture_output=True)
                        elif shutil.which("unrar"):
                            subprocess.run(["unrar", "x", "-o+", str(dest_path), str(unpacked_dir) + "/"], check=True, capture_output=True)
                except Exception as e:
                    self.send_json({"success": False, "error": f"Ошибка распаковки архива: {e}"})
                    return

                # Scan unpacked directory
                game_saves, system_save = scan_saves_in_dir(unpacked_dir)
                self.send_json({
                    "success": True,
                    "is_archive": True,
                    "archive_name": filename,
                    "current_dir": str(unpacked_dir),
                    "saves": game_saves,
                    "system_save": system_save
                })
                return
            else:
                # Single .bin file
                details = get_save_details(dest_path)
                details["is_latest"] = True
                self.send_json({
                    "success": True,
                    "is_archive": False,
                    "current_dir": str(UPLOAD_DIR),
                    "saves": [details],
                    "system_save": None
                })
                return

        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
        req_data = json.loads(body) if body else {}

        if path == "/api/convert":
            source_file = Path(req_data.get("source_file", ""))
            target_name = req_data.get("target_name", "data000.bin")
            mode = req_data.get("mode", "pc2ps5") # pc2ps5, pc2pc, ps52pc
            source_id = str(req_data.get("source_id", DEFAULT_STEAM_ID))
            target_id = str(req_data.get("target_id", DEFAULT_PS5_ID))
            region_hash = str(req_data.get("region_hash", "3208943443"))
            app_version = str(req_data.get("app_version", "16785408"))
            game_id = req_data.get("game_id", "").strip()
            use_game_folder = req_data.get("use_game_folder", False)

            output_dir = Path(req_data.get("output_dir", str(DEFAULT_OUTPUT_DIR)))
            if use_game_folder and game_id:
                output_dir = output_dir / game_id

            output_dir.mkdir(parents=True, exist_ok=True)
            output_file = output_dir / target_name

            if not source_file.exists():
                self.send_json({"success": False, "error": f"Файл не найден: {source_file}"})
                return

            converter = CONVERTER_BIN
            if not converter.exists():
                converter = Path("/home/axotn1k1/vscode/ree-save-editor/target/debug/convert_re9_ps5")

            # convert_re9_ps5 <input_path> <output_path> <source_id> [target_id] [mode] [ps5_region_hash] [ps5_app_version]
            cmd = [str(converter), str(source_file), str(output_file), source_id, target_id, mode, region_hash, app_version]
            try:
                res = subprocess.run(cmd, capture_output=True, text=True, check=True)
                self.send_json({
                    "success": True,
                    "output_file": str(output_file),
                    "output_dir": str(output_dir),
                    "mode": mode,
                    "log": res.stdout
                })
            except subprocess.CalledProcessError as e:
                self.send_json({
                    "success": False,
                    "error": f"Ошибка конвертации (код {e.returncode})",
                    "log": e.stdout + "\n" + e.stderr
                })
            return

        elif path == "/api/convert_batch":
            source_dir = Path(req_data.get("source_dir", str(DEFAULT_PC_SAVE_DIR)))
            output_dir = Path(req_data.get("output_dir", str(DEFAULT_OUTPUT_DIR)))
            mode = req_data.get("mode", "pc2ps5")
            source_id = str(req_data.get("source_id", DEFAULT_STEAM_ID))
            target_id = str(req_data.get("target_id", DEFAULT_PS5_ID))
            region_hash = str(req_data.get("region_hash", "3208943443"))
            app_version = str(req_data.get("app_version", "16785408"))
            game_id = req_data.get("game_id", "").strip()
            use_game_folder = req_data.get("use_game_folder", False)

            if use_game_folder and game_id:
                output_dir = output_dir / game_id

            output_dir.mkdir(parents=True, exist_ok=True)
            converter = CONVERTER_BIN
            if not converter.exists():
                converter = Path("/home/axotn1k1/vscode/ree-save-editor/target/debug/convert_re9_ps5")

            cmd = [str(converter), str(source_dir), str(output_dir), source_id, target_id, mode, region_hash, app_version]

            output_dir.mkdir(parents=True, exist_ok=True)
            converter = CONVERTER_BIN
            if not converter.exists():
                converter = Path("/home/axotn1k1/vscode/ree-save-editor/target/debug/convert_re9_ps5")

            cmd = [str(converter), str(source_dir), str(output_dir), source_id, target_id, mode]
            try:
                res = subprocess.run(cmd, capture_output=True, text=True, check=True)
                self.send_json({
                    "success": True,
                    "output_dir": str(output_dir),
                    "mode": mode,
                    "log": res.stdout
                })
            except subprocess.CalledProcessError as e:
                self.send_json({
                    "success": False,
                    "error": f"Ошибка пакетной конвертации (код {e.returncode})",
                    "log": e.stdout + "\n" + e.stderr
                })
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
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

def main():
    print(f"Starting RE9 Save Converter GUI Server on http://127.0.0.1:{PORT} ...")
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), AppRequestHandler) as httpd:
        print(f"Serving at http://127.0.0.1:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")

if __name__ == "__main__":
    main()
