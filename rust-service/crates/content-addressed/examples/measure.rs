use std::{
    fs,
    io::{Cursor, Read},
    path::PathBuf,
};

use snapshotted_stream_content_addressed::{
    ContentStore, StoreConfig, SummaryEntry, SummaryManifest,
};

const LARGE_BYTES: u64 = 16 * 1024 * 1024;

struct GeneratedReader {
    remaining: u64,
}

impl Read for GeneratedReader {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        let read = buffer
            .len()
            .min(usize::try_from(self.remaining).unwrap_or(usize::MAX));
        buffer[..read].fill(0xa5);
        self.remaining -= u64::try_from(read).expect("read length fits in u64");
        Ok(read)
    }
}

fn main() {
    let root = measurement_directory();
    let _ = fs::remove_dir_all(&root);
    let config = StoreConfig {
        max_blob_bytes: LARGE_BYTES,
        copy_buffer_bytes: 64 * 1024,
        ..StoreConfig::default()
    };
    let store = ContentStore::open(&root, config).expect("open measurement store");
    let high_water_before_kib = resident_high_water_kib();
    let small = store
        .put_blob(Cursor::new(vec![0x3c; 1024]))
        .expect("publish small blob");
    let large = store
        .put_blob(GeneratedReader {
            remaining: LARGE_BYTES,
        })
        .expect("publish large blob");
    let summary = store
        .publish_summary(&SummaryManifest {
            entries: vec![
                SummaryEntry {
                    path: "large".to_owned(),
                    blob: large.digest,
                },
                SummaryEntry {
                    path: "small".to_owned(),
                    blob: small.digest,
                },
            ],
        })
        .expect("publish summary");
    let high_water_after_kib = resident_high_water_kib();

    println!("small_payload_bytes={}", small.size_bytes);
    println!(
        "small_persisted_bytes={}",
        fs::metadata(store.blob_path(small.digest))
            .expect("small blob metadata")
            .len()
    );
    println!("large_payload_bytes={}", large.size_bytes);
    println!(
        "large_persisted_bytes={}",
        fs::metadata(store.blob_path(large.digest))
            .expect("large blob metadata")
            .len()
    );
    println!("summary_persisted_bytes={}", summary.persisted_bytes);
    println!("copy_buffer_bytes={}", config.copy_buffer_bytes);
    println!("vm_hwm_before_kib={high_water_before_kib}");
    println!("vm_hwm_after_kib={high_water_after_kib}");
    println!(
        "vm_hwm_delta_kib={}",
        high_water_after_kib.saturating_sub(high_water_before_kib)
    );
    fs::remove_dir_all(root).expect("remove measurement store");
}

fn measurement_directory() -> PathBuf {
    std::env::temp_dir().join(format!("content-addressed-measure-{}", std::process::id()))
}

fn resident_high_water_kib() -> u64 {
    fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|status| {
            status.lines().find_map(|line| {
                line.strip_prefix("VmHWM:")?
                    .split_whitespace()
                    .next()?
                    .parse()
                    .ok()
            })
        })
        .unwrap_or(0)
}
