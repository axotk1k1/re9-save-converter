use ree_lib::save::{
    crypto::Mandarin,
    game::Game,
    SaveFile, SaveFlags, SaveOptions,
};
use std::path::{Path, PathBuf};
use util::{align_up, murmur3};

const PS5_RE9_ID: u64 = 394424879635983;

fn convert_file(
    input_path: &Path,
    output_path: &Path,
    source_id: u64,
    target_id: u64,
    mode: &str,
    target_region: u32,
    target_version: u32,
) -> Result<(), Box<dyn std::error::Error>> {
    println!("Converting ({mode}): {}", input_path.display());
    let raw_data = std::fs::read(input_path)?;

    // 1. Decrypt with source ID
    let mut options = SaveOptions::new(Game::RE9).id(source_id);
    let (decrypted_stream, data_offset, _blowfish_opt, flags) =
        SaveFile::process_bytes_to_stream(raw_data, &mut options)?;

    let mut payload = decrypted_stream[data_offset as usize..].to_vec();
    let decrypted_len = payload.len() as u64;

    let pc_region = 1874947740u32.to_le_bytes();
    let ps5_region = target_region.to_le_bytes();
    let pc_ver = 16781314u32.to_le_bytes();
    let ps5_ver = target_version.to_le_bytes();

    let mut patched_region = 0;
    let mut patched_ver = 0;

    if mode == "pc2ps5" && payload.len() >= 4 {
        for i in 0..payload.len() - 3 {
            if payload[i..i+4] == pc_region {
                payload[i..i+4].copy_from_slice(&ps5_region);
                patched_region += 1;
            }
            if payload[i..i+4] == pc_ver {
                payload[i..i+4].copy_from_slice(&ps5_ver);
                patched_ver += 1;
            }
        }
    } else if mode == "ps52pc" && payload.len() >= 4 {
        for i in 0..payload.len() - 3 {
            if payload[i..i+4] == ps5_region {
                payload[i..i+4].copy_from_slice(&pc_region);
                patched_region += 1;
            }
            if payload[i..i+4] == ps5_ver {
                payload[i..i+4].copy_from_slice(&pc_ver);
                patched_ver += 1;
            }
        }
    }

    println!(
        "  Decrypted successfully! Size: {} bytes, Flags: {:?} (Patches: Region={}:0x{:x}, Ver={}:0x{:x})",
        decrypted_len, flags, patched_region, target_region, patched_ver, target_version
    );

    // 2. Encrypt with target ID using Mandarin
    let mandarin = Mandarin::init_from_game(Game::RE9)?;
    let target_key = Game::RE9.get_key_from_steamid(target_id);
    let mut enc_payload = mandarin.encrypt(&payload, target_key)?;

    // 3. Append decrypted size (8 bytes LE)
    enc_payload.extend_from_slice(&decrypted_len.to_le_bytes());

    // 4. Build output file: Header (16 bytes) + Encrypted Payload
    let mut output_data = decrypted_stream[..data_offset as usize].to_vec();
    output_data.extend_from_slice(&enc_payload);

    // 5. Align up to 4 bytes and calculate Murmur3 checksum
    let aligned_len = align_up(output_data.len(), 4);
    output_data.resize(aligned_len, 0);
    let file_hash = murmur3(&output_data, 0xffffffff);
    output_data.extend_from_slice(&file_hash.to_le_bytes());

    // 6. Verify by decrypting output back with target ID!
    let mut verify_options = SaveOptions::new(Game::RE9).id(target_id);
    let (verify_stream, v_offset, _, _v_flags) =
        SaveFile::process_bytes_to_stream(output_data.clone(), &mut verify_options)?;
    let verify_payload = &verify_stream[v_offset as usize..];

    if verify_payload != payload.as_slice() {
        return Err("Verification failed: Decrypted output payload does not match expected payload!".into());
    }
    println!("  Verification PASSED! Output decrypts cleanly with ID: {}", target_id);

    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(output_path, &output_data)?;
    println!("  Saved converted save to: {}\n", output_path.display());
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 4 {
        eprintln!("Usage: convert_re9_ps5 <input_path> <output_path> <source_id> [target_id] [mode] [ps5_region_hash] [ps5_app_version]");
        eprintln!("Modes: pc2ps5 (default), pc2pc, ps52pc");
        std::process::exit(1);
    }

    let input_path = PathBuf::from(&args[1]);
    let output_path = PathBuf::from(&args[2]);
    let source_id: u64 = args[3].parse()?;
    let target_id: u64 = if args.len() > 4 {
        args[4].parse()?
    } else {
        PS5_RE9_ID
    };
    let mode = if args.len() > 5 {
        args[5].as_str()
    } else {
        if target_id == PS5_RE9_ID { "pc2ps5" } else { "pc2pc" }
    };
    let target_region: u32 = if args.len() > 6 {
        args[6].parse()?
    } else {
        3208943443
    };
    let target_version: u32 = if args.len() > 7 {
        args[7].parse()?
    } else {
        16785408
    };

    if input_path.is_file() {
        let out_file = if output_path.is_dir() {
            output_path.join(input_path.file_name().unwrap())
        } else {
            output_path
        };
        convert_file(&input_path, &out_file, source_id, target_id, mode, target_region, target_version)?;
    } else if input_path.is_dir() {
        let entries = std::fs::read_dir(&input_path)?;
        let mut count = 0;
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.ends_with(".bin") {
                        let out_file = output_path.join(name);
                        convert_file(&path, &out_file, source_id, target_id, mode, target_region, target_version)?;
                        count += 1;
                    }
                }
            }
        }
        println!("Successfully converted {} save files!", count);
    } else {
        eprintln!("Input path not found: {}", input_path.display());
        std::process::exit(1);
    }

    Ok(())
}
