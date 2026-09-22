//! Bounded native single-session submission measurements, with verified ordered replay.

use std::{env, fs, path::Path, time::Instant};

use bytes::Bytes;
use futures_util::{StreamExt, stream};
use sea_core::{
    Event, EventSubmission, MonitoredStreamItem, SeaAuthorSession, SessionId,
    archive::SessionEventKind, session::SeaArchive, storage::SeaStorage,
};
use sea_file::storage::FileStorage;
use sea_memory::MemoryStorage;
use sea_sequencer::session::LocalSequencer;
use serde_json::{Value, json};

/// Runs one explicitly selected cell on one async worker; file I/O may use blocking workers.
#[tokio::main(flavor = "current_thread")]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("storage-pipeline failed: {error}");
        std::process::exit(1);
    }
}

/// Validates fixed workload choices and keeps warmup on a separate fresh document.
async fn run() -> Result<(), String> {
    let arguments: Vec<_> = env::args().skip(1).collect();
    let [backend, payload_bytes, window, directory] = arguments.as_slice() else {
        return Err(
            "usage: storage-pipeline memory|buffered-file|durable-file 64|8192 1|128 NEW_DIRECTORY"
                .into(),
        );
    };
    let payload_bytes = payload_bytes.parse::<usize>().map_err(display_error)?;
    let window = window.parse::<usize>().map_err(display_error)?;
    if !matches!(payload_bytes, 64 | 8192) || !matches!(window, 1 | 128) {
        return Err("payload must be 64 or 8192; window must be 1 or 128".into());
    }
    if !matches!(
        backend.as_str(),
        "memory" | "buffered-file" | "durable-file"
    ) {
        return Err("unknown backend".into());
    }
    let directory = Path::new(directory);
    fs::create_dir(directory).map_err(display_error)?;
    let outcome = async {
        for (phase, operations) in [("warmup", 128), ("measured", 4096)] {
            let path = directory.join(phase);
            let mut result = match backend.as_str() {
                "memory" => {
                    exercise(MemoryStorage::new(), payload_bytes, window, operations).await?
                }
                "buffered-file" => {
                    exercise(
                        FileStorage::<false>::open(&path).map_err(display_error)?,
                        payload_bytes,
                        window,
                        operations,
                    )
                    .await?
                }
                "durable-file" => {
                    exercise(
                        FileStorage::<true>::open(&path).map_err(display_error)?,
                        payload_bytes,
                        window,
                        operations,
                    )
                    .await?
                }
                _ => unreachable!(),
            };
            result["backend"] = json!(backend);
            result["phase"] = json!(phase);
            result["directory"] = json!(path);
            result["persisted_bytes"] = json!(persisted_bytes(&path)?);
            println!("{result}");
            if path.exists() {
                fs::remove_dir_all(path).map_err(display_error)?;
            }
        }
        Ok(())
    }
    .await;
    let cleanup = fs::remove_dir_all(directory).map_err(display_error);
    outcome.and(cleanup)
}

/// Measures only bounded submissions, then checks every receipt against finite ordered replay.
/// Ordinary buffered futures exercise first-poll admission order under cooperative scheduling.
async fn exercise<Storage: SeaStorage + 'static>(
    storage: Storage,
    payload_bytes: usize,
    window: usize,
    operations: u32,
) -> Result<Value, String> {
    let (_, view) = storage.create_view().await.map_err(display_error)?;
    let sequencer = LocalSequencer::<Storage>::recover(view)
        .await
        .map_err(display_error)?;
    let identity =
        SessionId::new(Bytes::from_static(b"benchmark-session")).expect("nonempty session");
    let session = sequencer
        .open_session(identity.clone(), None)
        .await
        .map_err(display_error)?;
    let started = Instant::now();
    let mut pending = stream::iter(0..operations)
        .map(|index| {
            let session = &session;
            async move {
                let started = Instant::now();
                let position = session
                    .submit(EventSubmission {
                        reference: None,
                        event: Event {
                            payload: payload(index, payload_bytes),
                            blob_tree: None,
                        },
                    })
                    .await
                    .map_err(display_error)?;
                Ok::<_, String>((position, started.elapsed().as_secs_f64() * 1_000_000.0))
            }
        })
        .buffered(window);
    let mut receipts = Vec::new();
    let mut latencies = Vec::new();
    while let Some(result) = pending.next().await {
        let (position, latency) = result?;
        if receipts
            .last()
            .is_some_and(|previous| *previous >= position)
        {
            return Err(format!(
                "receipts are not strictly ordered: window={window}, bytes={payload_bytes}, index={}, previous={:?}, position={position:?}",
                receipts.len(),
                receipts.last()
            ));
        }
        receipts.push(position);
        latencies.push(latency);
    }
    let seconds = started.elapsed().as_secs_f64();
    let last = *receipts.last().ok_or("no receipts")?;
    let mut events = session.read(None, Some(last));
    let mut delivered = 0_u32;
    while let Some(event) = events.next().await {
        if let MonitoredStreamItem::Item(event) = event.map_err(display_error)? {
            if event.kind != SessionEventKind::Application
                || event.session_id != identity
                || event.committed.event.payload != payload(delivered, payload_bytes)
                || receipts.get(delivered as usize) != Some(&event.committed.position)
            {
                return Err(format!("replay mismatch at {delivered}"));
            }
            delivered += 1;
        }
    }
    if delivered != operations || receipts.len() != operations as usize {
        return Err("receipt or delivery count mismatch".into());
    }
    drop(events);
    drop(pending);
    session.close().await.map_err(display_error)?;
    sequencer.shutdown().await.map_err(display_error)?;
    latencies.sort_by(f64::total_cmp);
    Ok(json!({
        "boundary": "local-sequencer-submit",
        "payload_bytes": payload_bytes,
        "operations": operations,
        "max_inflight": window,
        "async_workers": 1,
        "seconds": seconds,
        "operations_per_second": f64::from(operations) / seconds,
        "submit_latency_p50_us": latencies[latencies.len() / 2],
        "submit_latency_p99_us": latencies[(latencies.len() - 1) * 99 / 100],
        "verified_deliveries": delivered,
        "verified_order": true,
        "physical_durability_verified": false,
    }))
}

/// Encodes the sequence in a fixed-size payload so replay detects reorder and corruption.
fn payload(index: u32, size: usize) -> Bytes {
    let mut payload = vec![0x5a; size];
    payload[..4].copy_from_slice(&index.to_be_bytes());
    Bytes::from(payload)
}

/// Counts flat journal files after clean shutdown; memory cells have no files.
fn persisted_bytes(path: &Path) -> Result<u64, String> {
    if !path.exists() {
        return Ok(0);
    }
    fs::read_dir(path)
        .map_err(display_error)?
        .try_fold(0, |total, entry| {
            Ok(total
                + entry
                    .map_err(display_error)?
                    .metadata()
                    .map_err(display_error)?
                    .len())
        })
}

/// Normalizes backend errors without adding a dependency to the baseline-compatible binary.
fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(flavor = "current_thread")]
    async fn bounded_single_session_replays_in_order() {
        for window in [1, 128] {
            for size in [64, 8192] {
                let result = exercise(MemoryStorage::new(), size, window, 257)
                    .await
                    .unwrap();
                assert_eq!(result["verified_deliveries"], 257);
                assert_eq!(result["verified_order"], true);
            }
        }
    }
}
