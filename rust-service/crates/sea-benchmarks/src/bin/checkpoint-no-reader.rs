//! Bounded zero-subscription fixture for the checkpoint-1 matched no-reader controls.

use std::{
    io::{BufRead as _, Write as _},
    path::Path,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use bytes::Bytes;
use futures_util::StreamExt as _;
use sea_benchmarks::measurement::MeasurementClock;
use sea_core::{
    Event, EventPosition, EventSubmission, MonitoredStreamItem, SeaAuthorSession, SessionId,
    archive::SessionEventKind, session::SeaArchive, storage::SeaStorage,
};
use sea_memory::MemoryStorage;
use sea_sequencer::session::LocalSequencer;
use serde_json::{Value, json};

/// Per-document acknowledgment telemetry, with no subscription or writer echo.
#[derive(Default)]
struct State {
    /// Every paced submission, including warmup.
    sent: usize,
    /// Submissions after warmup.
    measured_sent: usize,
    /// Successfully acknowledged submissions.
    acknowledged: usize,
    /// Measured submissions acknowledged before the window closes.
    measured_acknowledged: usize,
    /// All acknowledgments in the common host epoch.
    acknowledgments: Vec<u64>,
    /// Submit-to-acknowledge milliseconds for measured submissions.
    latencies: Vec<f64>,
    /// First submission failure.
    error: Option<String>,
}

/// The same operation payload as the native network generator.
fn payload(sequence: usize) -> Bytes {
    let mut bytes = format!("{sequence:08}").into_bytes();
    bytes.resize(64, b'x');
    Bytes::from(bytes)
}

/// Checks the exact finite replay after measurement without creating a subscription during writes.
async fn verify_replay<Session: SeaArchive>(
    session: &Session,
    identity: &SessionId,
    receipts: &[EventPosition],
) -> Result<usize, String> {
    let last = *receipts.last().ok_or("no receipts")?;
    let mut events = session.read(None, Some(last));
    let mut count = 0;
    while let Some(event) = events.next().await {
        if let MonitoredStreamItem::Item(event) = event.map_err(display)? {
            if event.kind != SessionEventKind::Application
                || &event.session_id != identity
                || event.committed.event.payload != payload(count + 1)
                || receipts.get(count) != Some(&event.committed.position)
            {
                return Err(format!("finite replay mismatch at {count}"));
            }
            count += 1;
        }
    }
    if count != receipts.len() {
        return Err("incomplete finite replay".into());
    }
    Ok(count)
}

/// Exchanges phase boundaries with the external CPU/RSS sampler.
fn exchange(message: &Value) -> Result<(), String> {
    println!("{message}");
    std::io::stdout().flush().map_err(display)?;
    let mut line = String::new();
    std::io::stdin()
        .lock()
        .read_line(&mut line)
        .map_err(display)?;
    if line.trim().is_empty() {
        return Err("missing phase signal".into());
    }
    Ok(())
}

/// Keeps the identical fixture source compatible with approved baseline APIs.
async fn recover<Storage: SeaStorage + 'static>(
    view: sea_core::storage::SeaView<Storage::Blobs, Storage::Events, Storage::Snapshots>,
) -> Result<Arc<LocalSequencer<Storage>>, String> {
    #[cfg(feature = "checkpoint-live-cache")]
    let result = LocalSequencer::<Storage>::recover_with_live_cache(view).await;
    #[cfg(not(feature = "checkpoint-live-cache"))]
    let result = LocalSequencer::<Storage>::recover(view).await;
    result.map_err(display)
}

/// Executes 32 serial-per-document writers in four bounded generator-equivalent shards.
#[allow(
    clippy::too_many_lines,
    reason = "Keeps the timed phase separate from finite replay"
)]
async fn exercise<Storage: SeaStorage + 'static>(storage: Storage) -> Result<(), String> {
    let clock = MeasurementClock::new();
    let mut sessions = Vec::new();
    let mut sequencers = Vec::new();
    let mut states = Vec::new();
    let mut senders = Vec::new();
    let mut writers = Vec::new();
    for _ in 0..32 {
        let (_, view) = storage.create_view().await.map_err(display)?;
        let sequencer = recover::<Storage>(view).await?;
        let session = Arc::new(sequencer.open_session(None).await.map_err(display)?);
        let state = Arc::new(Mutex::new(State::default()));
        let (sender, mut receiver) =
            tokio::sync::mpsc::channel::<(usize, Instant, bool, Instant)>(8192);
        let writer = Arc::clone(&session);
        let shared = Arc::clone(&state);
        writers.push(tokio::spawn(async move {
            let mut receipts = Vec::new();
            while let Some((sequence, sent_at, measured, end)) = receiver.recv().await {
                let result = writer
                    .submit(EventSubmission {
                        reference: None,
                        event: Event {
                            payload: payload(sequence),
                            blob_tree: None,
                        },
                    })
                    .await;
                let now = Instant::now();
                let mut state = shared.lock().expect("state lock");
                match result {
                    Ok(position) => {
                        receipts.push(position);
                        state.acknowledged += 1;
                        state.acknowledgments.push(clock.at(now));
                        if measured {
                            state
                                .latencies
                                .push(now.duration_since(sent_at).as_secs_f64() * 1000.0);
                            state.measured_acknowledged += usize::from(now < end);
                        }
                    }
                    Err(error) => {
                        state.error = Some(display(error));
                        break;
                    }
                }
            }
            receipts
        }));
        sessions.push(session);
        sequencers.push(sequencer);
        states.push(state);
        senders.push(sender);
    }
    exchange(
        &json!({"type":"ready","liveCache":cfg!(feature = "checkpoint-live-cache"),"subscriptionsDuringWrites":0}),
    )?;
    let started = Instant::now();
    let warm_end = started + Duration::from_secs(3);
    let end = warm_end + Duration::from_secs(10);
    let mut generators = Vec::new();
    for (shard, shard_senders) in senders.chunks(8).enumerate() {
        let senders = shard_senders.to_vec();
        let states = states[shard * 8..shard * 8 + 8].to_vec();
        generators.push(tokio::spawn(async move {
            let mut sent = 0_usize;
            let mut max_pending = 0_usize;
            let mut max_lag = 0.0_f64;
            let mut backlog = Vec::new();
            let mut last_sample = started;
            while Instant::now() < end {
                let now = Instant::now();
                let target = usize::try_from(now.duration_since(started).as_micros() * 250 / 1_000_000)
                    .map_err(display)?;
                max_lag = max_lag.max(f64::from(u32::try_from(target.saturating_sub(sent)).map_err(display)?) * 4.0);
                let pending: usize = states.iter().map(|state| {
                    let state = state.lock().expect("state lock");
                    state.sent - state.acknowledged
                }).sum();
                max_pending = max_pending.max(pending);
                if pending > 8192 || sent >= 1_000_000 {
                    return Err("bounded backlog or submission limit".to_owned());
                }
                for _ in 0..target.saturating_sub(sent).min(512) {
                    let index = sent % 8;
                    let at = Instant::now();
                    let sequence = {
                        let mut state = states[index].lock().expect("state lock");
                        if let Some(error) = &state.error { return Err(error.clone()); }
                        state.sent += 1;
                        state.measured_sent += usize::from(at >= warm_end);
                        state.sent
                    };
                    senders[index].try_send((sequence, at, at >= warm_end, end)).map_err(display)?;
                    sent += 1;
                }
                if now.duration_since(last_sample) >= Duration::from_millis(250) {
                    backlog.push(json!({"seconds":now.duration_since(started).as_secs_f64(),"pending":pending,"sent":sent}));
                    last_sample = now;
                }
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
            Ok::<_, String>(json!({"maxPending":max_pending,"maxScheduleLagMilliseconds":max_lag,"backlog":backlog}))
        }));
    }
    let mut shards = Vec::new();
    for generator in generators {
        shards.push(generator.await.map_err(display)??);
    }
    drop(senders);
    let receipts = tokio::time::timeout(Duration::from_secs(10), async {
        let mut all = Vec::new();
        for writer in writers {
            all.push(writer.await.map_err(display)?);
        }
        Ok::<_, String>(all)
    })
    .await
    .map_err(display)??;
    let mut workers = Vec::new();
    for (shard, mut result) in shards.into_iter().enumerate() {
        let mut sent = 0;
        let mut measured_sent = 0;
        let mut acknowledged = 0;
        let mut delivered = 0;
        let mut timestamps = Vec::new();
        let mut latencies = Vec::new();
        for state in &states[shard * 8..shard * 8 + 8] {
            let mut state = state.lock().expect("state lock");
            if let Some(error) = &state.error {
                return Err(error.clone());
            }
            if state.sent != state.acknowledged {
                return Err("incomplete acknowledgment drain".into());
            }
            sent += state.sent;
            measured_sent += state.measured_sent;
            acknowledged += state.acknowledged;
            delivered += state.measured_acknowledged;
            timestamps.append(&mut state.acknowledgments);
            latencies.append(&mut state.latencies);
        }
        latencies.sort_by(f64::total_cmp);
        result["sent"] = json!(sent);
        result["measuredSent"] = json!(measured_sent);
        result["acknowledged"] = json!(acknowledged);
        result["deliveredInWindow"] = json!(delivered);
        result["acknowledgmentEpochMicros"] = json!(timestamps);
        result["latencyMilliseconds"] =
            json!({"p95":latencies.get((latencies.len() * 95).div_ceil(100).saturating_sub(1))});
        result["measurementClock"] = clock.report();
        workers.push(result);
    }
    #[cfg(feature = "checkpoint-live-cache")]
    let allocation: Vec<_> = sequencers.iter().map(|sequencer| {
        let allocation = sequencer.live_cache_stats().expect("enabled cache");
        json!({"subscriptions":allocation.subscriptions,"claims":allocation.claims,"entries":allocation.entries,
            "payload_bytes":allocation.payload_bytes,"entry_capacity":allocation.entry_capacity})
    }).collect();
    #[cfg(not(feature = "checkpoint-live-cache"))]
    let allocation: Vec<Value> = Vec::new();
    exchange(&json!({"type":"timed-result","workers":workers,"cacheAllocation":allocation}))?;
    let mut replayed = 0;
    for ((session, sequencer), receipts) in sessions.iter().zip(&sequencers).zip(&receipts) {
        replayed += verify_replay(session.as_ref(), session.session_id(), receipts).await?;
        session.close().await.map_err(display)?;
        sequencer.shutdown().await.map_err(display)?;
    }
    storage.shutdown().await.map_err(display)?;
    println!(
        "{}",
        json!({"type":"result","replayed":replayed,"integrityErrors":0})
    );
    Ok(())
}

/// Converts operational errors without suppressing diagnostics.
fn display(error: impl std::fmt::Display) -> String {
    error.to_string()
}

/// Pins the direct fixture to eight execution workers; the caller controls CPU affinity.
#[tokio::main(flavor = "multi_thread", worker_threads = 8)]
async fn main() -> Result<(), String> {
    let arguments: Vec<_> = std::env::args().skip(1).collect();
    let [backend, directory] = arguments.as_slice() else {
        return Err(
            "usage: checkpoint-no-reader memory|buffered-file|durable-file NEW_DIRECTORY".into(),
        );
    };
    let path = Path::new(directory);
    std::fs::create_dir(path).map_err(display)?;
    match backend.as_str() {
        "memory" => exercise(MemoryStorage::new()).await,
        "buffered-file" => {
            exercise(sea_file::buffered::FileStorage::open(path).map_err(display)?).await
        }
        "durable-file" => {
            exercise(sea_file::durable::DurableStorage::open(path).map_err(display)?).await
        }
        _ => Err("unknown backend".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_no_reader_payload() {
        assert_eq!(payload(42).len(), 64);
        assert_eq!(&payload(42)[..8], b"00000042");
    }

    #[tokio::test]
    async fn replay_checks_identity_receipts_payloads_and_complete_history() {
        let storage = MemoryStorage::new();
        let (_, view) = storage.create_view().await.unwrap();
        let sequencer = recover::<MemoryStorage>(view).await.unwrap();
        let session = sequencer.open_session(None).await.unwrap();
        let mut receipts = Vec::new();
        for sequence in 1..=2 {
            receipts.push(
                session
                    .submit(EventSubmission {
                        reference: None,
                        event: Event {
                            payload: payload(sequence),
                            blob_tree: None,
                        },
                    })
                    .await
                    .unwrap(),
            );
        }
        assert_eq!(
            verify_replay(&session, session.session_id(), &receipts).await,
            Ok(2)
        );
        assert!(
            verify_replay(&session, &SessionId::new(u64::MAX).unwrap(), &receipts)
                .await
                .is_err()
        );
        assert!(
            verify_replay(&session, session.session_id(), &[receipts[1]])
                .await
                .is_err()
        );
        assert!(
            verify_replay(&session, session.session_id(), &[receipts[0], receipts[0]])
                .await
                .is_err()
        );
        receipts.push(
            session
                .submit(EventSubmission {
                    reference: None,
                    event: Event {
                        payload: payload(2),
                        blob_tree: None,
                    },
                })
                .await
                .unwrap(),
        );
        assert!(
            verify_replay(&session, session.session_id(), &receipts)
                .await
                .is_err()
        );
        session.close().await.unwrap();
        sequencer.shutdown().await.unwrap();
        storage.shutdown().await.unwrap();
    }
}
