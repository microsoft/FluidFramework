//! Bounded local factory churn with matched cached runtimes and concrete session dispatch.

use std::{env, fs, path::Path, sync::Arc, time::Instant};

use bytes::Bytes;
use futures_util::StreamExt as _;
use sea_core::{
    Event, EventPosition, EventSubmission, MonitoredStreamItem, SeaAuthorSession, SeaSession,
    SessionId,
    archive::SessionEventKind,
    factory::{PassThroughFactory, SessionFactory},
    storage::SeaStorage,
};
use sea_memory::MemoryStorage;
use sea_sequencer::{
    factory::LocalSessionFactory,
    session::{LocalSequencer, SessionError},
};
use serde_json::{Value, json};

/// Both modes retain exactly this many document runtimes for each sample.
const DOCUMENTS: usize = 32;

/// Uses one async worker; file storage may dispatch blocking I/O separately.
#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), String> {
    let arguments: Vec<_> = env::args().skip(1).collect();
    let [backend, mode, directory] = arguments.as_slice() else {
        return Err(
            "usage: session-factory memory|buffered-file|durable-file direct|pass-through NEW_DIRECTORY"
                .into(),
        );
    };
    if !matches!(
        backend.as_str(),
        "memory" | "buffered-file" | "durable-file"
    ) || !matches!(mode.as_str(), "direct" | "pass-through")
    {
        return Err("unknown backend or factory mode".into());
    }
    let directory = Path::new(directory);
    fs::create_dir(directory).map_err(display)?;
    let outcome = async {
        for (phase, opens) in [("warmup", 320), ("measured", 3200)] {
            let path = directory.join(phase);
            let mut result = match backend.as_str() {
                "memory" => select(MemoryStorage::new(), mode, opens).await?,
                "buffered-file" => {
                    select(
                        sea_file::buffered::FileStorage::open(&path).map_err(display)?,
                        mode,
                        opens,
                    )
                    .await?
                }
                "durable-file" => {
                    select(
                        sea_file::durable::DurableStorage::open(&path).map_err(display)?,
                        mode,
                        opens,
                    )
                    .await?
                }
                _ => unreachable!(),
            };
            result["backend"] = json!(backend);
            result["mode"] = json!(mode);
            result["phase"] = json!(phase);
            println!("{result}");
        }
        Ok(())
    }
    .await;
    let cleanup = fs::remove_dir_all(directory).map_err(display);
    outcome.and(cleanup)
}

/// Selects the concrete factory once, outside all timed operations.
async fn select<Storage: SeaStorage + 'static>(
    storage: Storage,
    mode: &str,
    opens: usize,
) -> Result<Value, String> {
    match mode {
        "direct" => exercise(storage, LocalSessionFactory::new, opens).await,
        "pass-through" => {
            exercise(
                storage,
                |sequencer| PassThroughFactory::new(LocalSessionFactory::new(sequencer)),
                opens,
            )
            .await
        }
        _ => Err("unknown factory mode".into()),
    }
}

/// Shuts down every recovered runtime and the storage even when a measurement check fails.
async fn exercise<Storage, Source>(
    storage: Storage,
    make_source: impl Fn(Arc<LocalSequencer<Storage>>) -> Source,
    opens: usize,
) -> Result<Value, String>
where
    Storage: SeaStorage + 'static,
    Source: SessionFactory<Error = SessionError<Storage::Error>>,
{
    let mut sequencers = Vec::with_capacity(DOCUMENTS);
    let outcome = async {
        if opens == 0 || !opens.is_multiple_of(DOCUMENTS) {
            return Err("opens must be a positive multiple of 32".into());
        }
        for _ in 0..DOCUMENTS {
            let (_, view) = storage.create_view().await.map_err(display)?;
            sequencers.push(
                LocalSequencer::<Storage>::recover_with_live_cache(view)
                    .await
                    .map_err(display)?,
            );
        }
        measure(&sequencers, make_source, opens).await
    }
    .await;
    let started = Instant::now();
    let mut cleanup = Ok(());
    for sequencer in &sequencers {
        let result = sequencer.shutdown().await.map_err(display);
        cleanup = cleanup.and(result);
    }
    drop(sequencers);
    let result = storage.shutdown().await.map_err(display);
    cleanup = cleanup.and(result);
    drop(storage);
    let mut result = outcome?;
    cleanup?;
    result["shutdown_seconds"] = json!(started.elapsed().as_secs_f64());
    result["shutdown_verified"] = json!(true);
    Ok(result)
}

/// Checks classified errors and sibling independence before timing unannounced open/close churn.
async fn measure<Storage, Source>(
    sequencers: &[Arc<LocalSequencer<Storage>>],
    make_source: impl Fn(Arc<LocalSequencer<Storage>>) -> Source,
    opens: usize,
) -> Result<Value, String>
where
    Storage: SeaStorage + 'static,
    Source: SessionFactory<Error = SessionError<Storage::Error>>,
{
    let factories: Vec<_> = sequencers.iter().cloned().map(make_source).collect();
    let verification_started = Instant::now();
    let mut previous_ids = Vec::with_capacity(DOCUMENTS);
    for factory in &factories {
        previous_ids.push(verify_factory(factory).await?);
    }
    let verification_seconds = verification_started.elapsed().as_secs_f64();
    let cache_before = cache_stats(sequencers)?;
    let started = Instant::now();
    let mut open_seconds = 0.0;
    let mut close_seconds = 0.0;
    let mut drop_seconds = 0.0;
    let mut counts = [0_usize; DOCUMENTS];
    for index in 0..opens {
        let document = index % DOCUMENTS;
        let open_started = Instant::now();
        let opened = factories[document]
            .open_session(None)
            .await
            .map_err(display)?;
        open_seconds += open_started.elapsed().as_secs_f64();
        if opened.id.get() <= previous_ids[document].get() {
            return Err("factory reused a document-scoped session identity".into());
        }
        previous_ids[document] = opened.id;
        let close_started = Instant::now();
        opened.session.close().await.map_err(display)?;
        close_seconds += close_started.elapsed().as_secs_f64();
        let drop_started = Instant::now();
        drop(opened.session);
        drop_seconds += drop_started.elapsed().as_secs_f64();
        counts[document] += 1;
    }
    let churn_seconds = started.elapsed().as_secs_f64();
    if counts.iter().any(|count| *count != opens / DOCUMENTS) {
        return Err("per-document churn count mismatch".into());
    }
    let cache_after = cache_stats(sequencers)?;
    drop(factories);
    Ok(json!({
        "boundary": "local-session-factory-open-close",
        "documents": DOCUMENTS,
        "live_cache": true,
        "dispatch": "concrete-generic",
        "async_workers": 1,
        "max_inflight": 1,
        "membership_announcements": 0,
        "requested_opens": opens,
        "successful_opens": counts.iter().sum::<usize>(),
        "successful_closes": counts.iter().sum::<usize>(),
        "opens_per_document": counts,
        "open_seconds": open_seconds,
        "close_seconds": close_seconds,
        "drop_seconds": drop_seconds,
        "churn_seconds": churn_seconds,
        "verification_seconds": verification_seconds,
        "verification_opens": DOCUMENTS * 2,
        "verification_closes": DOCUMENTS * 2,
        "verified_invalid_reference_errors": DOCUMENTS,
        "verified_closed_errors": DOCUMENTS,
        "verified_sibling_submissions": DOCUMENTS,
        "verified_replayed_events": DOCUMENTS,
        "integrity_errors": 0,
        "cache_before": cache_before,
        "cache_after": cache_after,
        "allocation_count": null,
        "allocation_measurement": "not-instrumented",
        "physical_durability_verified": false,
    }))
}

/// Uses one finite application event to verify identity, closure isolation, and exact replay.
async fn verify_factory<Source, Error>(factory: &Source) -> Result<SessionId, String>
where
    Source: SessionFactory<Error = SessionError<Error>>,
    Error: std::fmt::Display,
{
    if !matches!(
        factory
            .open_session(Some(EventPosition::new(u64::MAX)))
            .await,
        Err(SessionError::Rejected("invalid session reference"))
    ) {
        return Err("invalid reference did not retain its classified rejection".into());
    }
    let first = factory.open_session(None).await.map_err(display)?;
    let sibling = factory.open_session(None).await.map_err(display)?;
    if first.id.get() >= sibling.id.get() {
        return Err("sibling session identity was not fresh".into());
    }
    first.session.close().await.map_err(display)?;
    if !matches!(
        first.session.submit(submission()).await,
        Err(SessionError::Closed)
    ) {
        return Err("closed session did not retain its classified error".into());
    }
    let position = sibling
        .session
        .submit(submission())
        .await
        .map_err(display)?;
    verify_replay(&sibling.session, &sibling.id, position).await?;
    sibling.session.close().await.map_err(display)?;
    Ok(sibling.id)
}

/// Rejects missing, additional, or altered records, including unexpected membership announcements.
async fn verify_replay<Session: SeaSession>(
    session: &Session,
    identity: &SessionId,
    position: EventPosition,
) -> Result<(), String> {
    let mut stream = session.read(None, Some(position));
    let mut count = 0;
    while let Some(item) = stream.next().await {
        if let MonitoredStreamItem::Item(event) = item.map_err(display)? {
            if count != 0
                || event.session_id != *identity
                || event.committed.position != position
                || event.kind != SessionEventKind::Application
                || event.committed.event.payload != submission().event.payload
            {
                return Err("sibling finite replay mismatch".into());
            }
            count += 1;
        }
    }
    if count != 1 {
        return Err("sibling finite replay was incomplete".into());
    }
    Ok(())
}

/// Supplies the same small application event for both concrete session implementations.
fn submission() -> EventSubmission {
    EventSubmission {
        reference: None,
        event: Event {
            payload: Bytes::from_static(&[b'x'; 64]),
            blob_tree: None,
        },
    }
}

/// Reports exact cache ownership fields without treating them as allocator instrumentation.
fn cache_stats<Storage: SeaStorage + 'static>(
    sequencers: &[Arc<LocalSequencer<Storage>>],
) -> Result<Vec<Value>, String> {
    sequencers
        .iter()
        .map(|sequencer| {
            let stats = sequencer.live_cache_stats().ok_or("cache disabled")?;
            if stats.subscriptions != 0
                || stats.claims != 0
                || stats.entries != 0
                || stats.payload_bytes != 0
            {
                return Err("zero-subscription churn retained live cache ownership".into());
            }
            Ok(json!({
                "subscriptions": stats.subscriptions,
                "claims": stats.claims,
                "entries": stats.entries,
                "payload_bytes": stats.payload_bytes,
                "entry_capacity": stats.entry_capacity,
            }))
        })
        .collect()
}

/// Retains backend diagnostics at the executable boundary.
fn display(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn both_modes_verify_exact_churn_counts_errors_and_sibling_closure() {
        for mode in ["direct", "pass-through"] {
            let result = select(MemoryStorage::new(), mode, DOCUMENTS * 2)
                .await
                .unwrap();
            assert_eq!(result["successful_opens"], DOCUMENTS * 2);
            assert_eq!(result["successful_closes"], DOCUMENTS * 2);
            assert_eq!(result["opens_per_document"], json!(vec![2; DOCUMENTS]));
            assert_eq!(result["verified_invalid_reference_errors"], DOCUMENTS);
            assert_eq!(result["verified_closed_errors"], DOCUMENTS);
            assert_eq!(result["verified_sibling_submissions"], DOCUMENTS);
            assert_eq!(result["verified_replayed_events"], DOCUMENTS);
            assert_eq!(result["integrity_errors"], 0);
            assert_eq!(result["shutdown_verified"], true);
            assert_eq!(result["cache_before"].as_array().unwrap().len(), DOCUMENTS);
            assert_eq!(result["cache_after"].as_array().unwrap().len(), DOCUMENTS);
            assert!(result["allocation_count"].is_null());
        }
    }
}
