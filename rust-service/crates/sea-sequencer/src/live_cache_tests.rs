//! Focused experimental-cache regressions through the existing deterministic storage seam.

use super::*;
use crate::session::tests::data;
use sea_core::storage::StorageHandle;
use sea_core::{MonitoredStreamItem, MonitoredStreamStatus, archive::SessionEventKind};
use std::future::Future;

/// Counts executor notifications without spawning a task or polling to discover a change.
#[derive(Default)]
struct WakeCounter(AtomicUsize);

impl futures_util::task::ArcWake for WakeCounter {
    fn wake_by_ref(arc_self: &Arc<Self>) {
        arc_self.0.fetch_add(1, Ordering::SeqCst);
    }
}

/// A cache-enabled exclusive opening with controllable backend settlement.
async fn fixture() -> (FaultStorage, Arc<LocalSequencer<FaultStorage>>) {
    let storage = FaultStorage::default();
    let (_, view) = storage.create_view().await.unwrap();
    let runtime = LocalSequencer::recover_with_live_cache(view).await.unwrap();
    (storage, runtime)
}

/// Polls through catch-up progress without leaving a subscription parked on data.
async fn caught_up(
    stream: &mut ArchiveStream<
        sea_core::SessionCommittedEvent,
        EventPosition,
        SessionError<FaultError>,
    >,
) {
    settles(async {
        loop {
            match stream.next().await.unwrap().unwrap() {
                MonitoredStreamItem::Progress(progress)
                    if progress.status == MonitoredStreamStatus::AwaitingNewItems =>
                {
                    return;
                }
                MonitoredStreamItem::Progress(_) => {}
                MonitoredStreamItem::Item(_) => panic!("unexpected catch-up data"),
            }
        }
    })
    .await;
}

#[tokio::test]
async fn cache_is_opt_in_and_requires_independent_invalidation() {
    let storage = FaultStorage::default();
    let (_, view) = storage.create_view().await.unwrap();
    let baseline = LocalSequencer::<FaultStorage>::recover(view).await.unwrap();
    assert_eq!(baseline.live_cache_stats(), None);
    let (_, view) = storage.create_view().await.unwrap();
    storage
        .events
        .unsupported_observer
        .store(true, Ordering::SeqCst);
    assert!(matches!(
        LocalSequencer::<FaultStorage>::recover_with_live_cache(view).await,
        Err(SessionError::Rejected(
            "backend does not support independent invalidation"
        ))
    ));
}

#[tokio::test]
async fn caught_up_live_delivery_never_polls_archive_and_shares_exact_payload_backing() {
    let (storage, runtime) = fixture().await;
    let author = member(&runtime).await;
    let observer = member(&runtime).await;
    let mut first = observer.read(None, None);
    let mut second = observer.read(None, None);
    caught_up(&mut first).await;
    caught_up(&mut second).await;
    let polls = storage.events.read_polls.load(Ordering::SeqCst);
    let reads = storage.events.reads.load(Ordering::SeqCst);
    let mut input = submission(b"");
    input.event.payload = Bytes::from(vec![7; 4 * 1024 * 1024]).slice(123..130);
    let position = author.submit(input).await.unwrap();
    let stats = runtime.live_cache_stats().unwrap();
    assert_eq!(
        (stats.claims, stats.entries, stats.payload_bytes),
        (2, 1, 7)
    );
    assert!(stats.entry_capacity >= 1);
    let one = settles(data(&mut first)).await.unwrap();
    let two = settles(data(&mut second)).await.unwrap();
    assert_eq!(one.committed.position, position);
    assert_eq!(
        one.committed.event.payload.as_ptr(),
        two.committed.event.payload.as_ptr()
    );
    assert_eq!(one, two);
    let stats = runtime.live_cache_stats().unwrap();
    assert_eq!(
        (stats.entries, stats.payload_bytes, stats.entry_capacity),
        (0, 0, 0)
    );
    assert_eq!(storage.events.read_polls.load(Ordering::SeqCst), polls);
    assert_eq!(storage.events.reads.load(Ordering::SeqCst), reads);
    assert_eq!(
        one.committed.event.payload.len(),
        7,
        "downstream handle remains independent"
    );
}

#[tokio::test]
async fn historical_and_cached_backlogs_report_fallen_behind_without_inconsistent_snapshots() {
    for historical in [true, false] {
        let (_, runtime) = fixture().await;
        let author = member(&runtime).await;
        let mut parked = author.read(None, None);
        if !historical {
            caught_up(&mut parked).await;
        }
        let first = author.submit(submission(b"one")).await.unwrap();
        let second = author.submit(submission(b"two")).await.unwrap();
        let mut reader = author.read(None, None);
        assert!(matches!(
            reader.next().await.unwrap().unwrap(),
            MonitoredStreamItem::Progress(progress)
                if progress.previous.is_none()
                    && progress.latest_known == Some(second)
                    && progress.status == MonitoredStreamStatus::FallenBehind
        ));
        for position in [first, second] {
            assert_eq!(
                settles(data(&mut reader)).await.unwrap().committed.position,
                position
            );
            let progress = reader.progress();
            assert_eq!(progress.previous, Some(position));
            assert!(progress.latest_known >= progress.previous);
            if progress.status == MonitoredStreamStatus::FallenBehind {
                assert!(progress.previous < progress.latest_known);
            }
        }
        caught_up(&mut reader).await;
        author.submit(submission(b"three")).await.unwrap();
        let fourth = author.submit(submission(b"four")).await.unwrap();
        assert!(matches!(
            reader.next().await.unwrap().unwrap(),
            MonitoredStreamItem::Progress(progress)
                if progress.previous == Some(second)
                    && progress.latest_known == Some(fourth)
                    && progress.status == MonitoredStreamStatus::FallenBehind
        ));
    }
}

#[tokio::test]
async fn cached_progress_discovers_retained_and_new_frontiers_before_delivering_items() {
    let (_, runtime) = fixture().await;
    let author = member(&runtime).await;
    let mut parked = author.read(None, None);
    caught_up(&mut parked).await;
    let first = author.submit(submission(b"one")).await.unwrap();
    let second = author.submit(submission(b"two")).await.unwrap();
    let mut reader = author.read(None, None);
    for position in [first, second] {
        assert_eq!(
            settles(data(&mut reader)).await.unwrap().committed.position,
            position
        );
        let progress = reader.progress();
        assert_eq!(progress.previous, Some(position));
        assert_eq!(progress.latest_known, Some(second));
        assert_eq!(
            progress.status,
            if position == second {
                MonitoredStreamStatus::StreamingBacklog
            } else {
                MonitoredStreamStatus::FallenBehind
            }
        );
    }
    caught_up(&mut reader).await;
    let third = author.submit(submission(b"three")).await.unwrap();
    let fourth = author.submit(submission(b"four")).await.unwrap();
    for position in [third, fourth] {
        assert_eq!(
            settles(data(&mut reader)).await.unwrap().committed.position,
            position
        );
        let progress = reader.progress();
        assert_eq!(progress.previous, Some(position));
        assert_eq!(progress.latest_known, Some(fourth));
        assert_eq!(
            progress.status,
            if position == fourth {
                MonitoredStreamStatus::StreamingBacklog
            } else {
                MonitoredStreamStatus::FallenBehind
            }
        );
    }
    caught_up(&mut reader).await;
    assert_eq!(reader.progress().previous, reader.progress().latest_known);
    let fifth = author.submit(submission(b"five")).await.unwrap();
    assert!(matches!(
        reader.next().await.unwrap().unwrap(),
        MonitoredStreamItem::Progress(progress) if progress.latest_known == Some(fifth)
    ));
    let sixth = author.submit(submission(b"six")).await.unwrap();
    assert!(matches!(
        reader.next().await.unwrap().unwrap(),
        MonitoredStreamItem::Item(event) if event.committed.position == fifth
    ));
    assert_eq!(reader.progress().latest_known, Some(fifth));
    assert_eq!(
        settles(data(&mut reader)).await.unwrap().committed.position,
        sixth
    );
    assert_eq!(reader.progress().latest_known, Some(sixth));
}

#[tokio::test]
async fn revocation_drop_close_and_stale_capabilities_reclaim_without_polling() {
    let (_, runtime) = fixture().await;
    let author = member(&runtime).await;
    let observer = member(&runtime).await;
    let (mut first, stale) = observer.read_with_live_cache_revocation(None).unwrap();
    caught_up(&mut first).await;
    let mut sibling = observer.read(None, None);
    caught_up(&mut sibling).await;
    author.submit(submission(b"retained")).await.unwrap();
    stale.revoke();
    stale.revoke();
    assert_eq!(runtime.live_cache_stats().unwrap().claims, 1);
    assert!(matches!(
        first.next().await.unwrap(),
        Err(SessionError::SubscriptionRevoked)
    ));
    assert!(first.next().await.is_none());
    drop(sibling);
    assert_eq!(runtime.live_cache_stats().unwrap().entries, 0);
    let head = runtime.runtime.lock().await.applied_through;
    let mut replacement = observer.read(head, None);
    caught_up(&mut replacement).await;
    stale.revoke();
    author.submit(submission(b"replacement")).await.unwrap();
    assert_eq!(runtime.live_cache_stats().unwrap().entries, 1);
    observer.close().await.unwrap();
    assert_eq!(runtime.live_cache_stats().unwrap().subscriptions, 0);
    assert_eq!(runtime.live_cache_stats().unwrap().payload_bytes, 0);
    assert!(matches!(
        replacement.next().await.unwrap(),
        Err(SessionError::Closed)
    ));
    author.submit(submission(b"author intact")).await.unwrap();
    assert_eq!(runtime.live_cache_stats().unwrap().entries, 0);
    let unpolled = author.read(None, None);
    assert_eq!(runtime.live_cache_stats().unwrap().subscriptions, 1);
    runtime.shutdown().await.unwrap();
    assert_eq!(runtime.live_cache_stats().unwrap().subscriptions, 0);
    drop(unpolled);
}

#[tokio::test]
async fn historical_finite_load_and_missed_handoff_preserve_exact_delivered_cursor() {
    let (storage, runtime) = fixture().await;
    let author = member(&runtime).await;
    let first = author.submit(submission(b"one")).await.unwrap();
    let second = author.submit(submission(b"two")).await.unwrap();
    let mut historical = author.read(None, None);
    assert_eq!(runtime.live_cache_stats().unwrap().claims, 0);
    let progress = historical.next().await.unwrap().unwrap();
    assert!(
        matches!(progress, MonitoredStreamItem::Progress(ref progress)
        if progress.latest_known == Some(second) && progress.previous.is_none())
    );
    assert_eq!(
        runtime.live_cache_stats().unwrap().claims,
        0,
        "head progress is not delivered data"
    );
    assert_eq!(
        settles(data(&mut historical))
            .await
            .unwrap()
            .committed
            .position,
        first
    );
    // No claim during replay: this publication is immediately reclaimed.
    let third = author.submit(submission(b"three")).await.unwrap();
    assert_eq!(runtime.live_cache_stats().unwrap().entries, 0);
    assert_eq!(
        settles(data(&mut historical))
            .await
            .unwrap()
            .committed
            .position,
        second
    );
    assert_eq!(
        settles(data(&mut historical))
            .await
            .unwrap()
            .committed
            .position,
        third
    );
    caught_up(&mut historical).await;
    assert_eq!(runtime.live_cache_stats().unwrap().claims, 1);
    let mut finite = author.read(Some(first), Some(third));
    let reads = storage.events.reads.load(Ordering::SeqCst);
    assert_eq!(
        settles(data(&mut finite)).await.unwrap().committed.position,
        second
    );
    assert_eq!(
        settles(data(&mut finite)).await.unwrap().committed.position,
        third
    );
    assert!(settles(data(&mut finite)).await.is_none());
    assert!(storage.events.reads.load(Ordering::SeqCst) > reads);
    assert_eq!(runtime.live_cache_stats().unwrap().claims, 1);
    let mut loaded = author.load(LoadStart::Beginning).await.unwrap().events;
    for expected in [first, second, third] {
        assert_eq!(
            settles(data(&mut loaded)).await.unwrap().committed.position,
            expected
        );
    }
    caught_up(&mut loaded).await;
    let fourth = author.submit(submission(b"four")).await.unwrap();
    assert_eq!(
        settles(data(&mut loaded)).await.unwrap().committed.position,
        fourth
    );
    assert_eq!(
        settles(data(&mut historical))
            .await
            .unwrap()
            .committed
            .position,
        fourth
    );
}

#[tokio::test]
async fn cancellation_retained_append_is_driven_only_by_live_reader_after_ack() {
    for failure in [Failure::GateBefore, Failure::GateAfter] {
        let (storage, runtime) = fixture().await;
        let writer = member(&runtime).await;
        let observer = member(&runtime).await;
        let mut stream = observer.read(None, None);
        caught_up(&mut stream).await;
        let polls = storage.events.read_polls.load(Ordering::SeqCst);
        let counter = Arc::new(WakeCounter::default());
        let waker = futures_util::task::waker(counter.clone());
        let mut waiting = Box::pin(data(&mut stream));
        assert!(
            waiting
                .as_mut()
                .poll(&mut std::task::Context::from_waker(&waker))
                .is_pending()
        );
        storage.events.arm(failure);
        let mut submit = Box::pin(writer.submit(submission(b"cancelled")));
        assert!(submit.as_mut().now_or_never().is_none());
        assert_eq!(runtime.live_cache_stats().unwrap().entries, 0);
        drop(submit);
        assert!(
            counter.0.load(Ordering::SeqCst) > 0,
            "installing retained work must wake an already parked reader"
        );
        assert!(
            waiting
                .as_mut()
                .poll(&mut std::task::Context::from_waker(&waker))
                .is_pending(),
            "no publication before backend acknowledgement"
        );
        assert!(
            runtime.runtime.try_lock().is_ok(),
            "a parked read cannot own the runtime mutex"
        );
        assert!(
            runtime.pipeline.gate.try_write().is_ok(),
            "a parked read cannot own the lifecycle gate"
        );
        storage.events.release.notify_one();
        let event = settles(waiting).await.unwrap();
        assert_eq!(event.committed.event.payload, b"cancelled".as_slice());
        assert_eq!(storage.events.calls.load(Ordering::SeqCst), 1);
        assert_eq!(storage.events.read_polls.load(Ordering::SeqCst), polls);
    }
}

#[tokio::test]
async fn independent_invalidation_releases_unpolled_claims_and_wakes_active_read() {
    let (storage, runtime) = fixture().await;
    let author = member(&runtime).await;
    let mut active = author.read(None, None);
    let mut parked = author.read(None, None);
    caught_up(&mut active).await;
    caught_up(&mut parked).await;
    author.submit(submission(b"pinned")).await.unwrap();
    data(&mut active).await.unwrap();
    caught_up(&mut active).await;
    let counter = Arc::new(WakeCounter::default());
    let waker = futures_util::task::waker(counter.clone());
    let mut waiting = Box::pin(active.next());
    assert!(
        waiting
            .as_mut()
            .poll(&mut std::task::Context::from_waker(&waker))
            .is_pending()
    );
    let polls = storage.events.read_polls.load(Ordering::SeqCst);
    storage
        .events
        .invalidation
        .invalidate(FaultError::Injected(ErrorKind::Unavailable));
    assert_eq!(runtime.live_cache_stats().unwrap().subscriptions, 0);
    assert_eq!(runtime.live_cache_stats().unwrap().payload_bytes, 0);
    assert!(
        counter.0.load(Ordering::SeqCst) > 0,
        "invalidation must wake without an archive poll"
    );
    let error = settles(waiting).await.unwrap().unwrap_err();
    assert_eq!(error.kind(), ErrorKind::Unavailable);
    assert!(matches!(error, SessionError::StorageInvalidated(_)));
    assert_eq!(storage.events.read_polls.load(Ordering::SeqCst), polls);
    assert!(matches!(
        parked.next().await.unwrap(),
        Err(SessionError::StorageInvalidated(_))
    ));
}

#[tokio::test]
async fn ordered_membership_and_cancelled_control_use_same_publication_boundary() {
    let (storage, runtime) = fixture().await;
    let writer = member(&runtime).await;
    let observer = member(&runtime).await;
    let mut stream = observer.read(None, None);
    caught_up(&mut stream).await;
    storage.events.arm(Failure::GateAfter);
    let mut join = Box::pin(writer.announce_membership(Bytes::from_static(b"member")));
    assert!(join.as_mut().now_or_never().is_none());
    assert_eq!(runtime.live_cache_stats().unwrap().entries, 0);
    drop(join);
    storage.events.release.notify_one();
    let joined = settles(data(&mut stream)).await.unwrap();
    // Reading settles the accepted join; ordinary lifecycle work closes failed authors.
    observer.get_snapshot(LoadStart::Beginning).await.unwrap();
    let left = settles(data(&mut stream)).await.unwrap();
    assert_eq!(joined.kind, SessionEventKind::Joined);
    assert_eq!(left.kind, SessionEventKind::Left);
    assert!(joined.committed.position < left.committed.position);
    assert_eq!(storage.events.calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn cancelled_dispatched_batch_publishes_accepted_prefix_without_archive_polling() {
    let (storage, runtime) = fixture().await;
    let lead = member(&runtime).await;
    let first = member(&runtime).await;
    let second = member(&runtime).await;
    let observer = member(&runtime).await;
    let mut stream = observer.read(None, None);
    caught_up(&mut stream).await;
    let polls = storage.events.read_polls.load(Ordering::SeqCst);
    storage.events.arm(Failure::GateBefore);
    let mut blocked = Box::pin(lead.submit(submission(b"lead")));
    let mut queued = Box::pin(first.submit(submission(b"first")));
    let mut suffix = Box::pin(second.submit(submission(b"second")));
    assert!(blocked.as_mut().now_or_never().is_none());
    assert!(queued.as_mut().now_or_never().is_none());
    assert!(suffix.as_mut().now_or_never().is_none());
    assert_eq!(runtime.live_cache_stats().unwrap().entries, 0);
    storage.events.release.notify_one();
    settles(blocked).await.unwrap();
    storage.events.arm(Failure::GateAfter);
    settles(async {
        while storage.events.batches.load(Ordering::SeqCst) == 0 {
            assert!(queued.as_mut().now_or_never().is_none());
            tokio::task::yield_now().await;
        }
    })
    .await;
    drop((queued, suffix));
    assert_eq!(
        runtime.live_cache_stats().unwrap().entries,
        1,
        "unacknowledged batch is not published"
    );
    assert_eq!(
        settles(data(&mut stream))
            .await
            .unwrap()
            .committed
            .event
            .payload,
        b"lead".as_slice()
    );
    caught_up(&mut stream).await;
    assert!(stream.next().now_or_never().is_none());
    storage.events.release.notify_one();
    for expected in [b"first".as_slice(), b"second".as_slice()] {
        assert_eq!(
            settles(data(&mut stream))
                .await
                .unwrap()
                .committed
                .event
                .payload,
            expected
        );
    }
    assert_eq!(storage.events.calls.load(Ordering::SeqCst), 3);
    assert_eq!(storage.events.batches.load(Ordering::SeqCst), 1);
    assert_eq!(storage.events.read_polls.load(Ordering::SeqCst), polls);
}

#[tokio::test]
async fn snapshot_load_handoff_and_subscription_revocation_leave_publisher_and_author_intact() {
    let (_, runtime) = fixture().await;
    let author = member(&runtime).await;
    let first = author
        .submit(submission(b"snapshot boundary"))
        .await
        .unwrap();
    let second = author.submit(submission(b"suffix")).await.unwrap();
    let root = author
        .put_blob(Bytes::from_static(b"snapshot"))
        .await
        .unwrap();
    let at_event = author.resolve_position(first).await.unwrap().unwrap();
    let mut coordination = author
        .coordinate_snapshots(SnapshotParticipation::ClientSelected)
        .await
        .unwrap();
    coordination.next().await.unwrap().unwrap();
    author
        .publish_snapshot(None, None, Snapshot { root, at_event })
        .await
        .unwrap();
    let load = author.load(LoadStart::LatestSnapshot).await.unwrap();
    assert_eq!(load.snapshot.unwrap().at_event.id(), first);
    let mut stream = load.events;
    assert_eq!(runtime.live_cache_stats().unwrap().claims, 0);
    assert_eq!(
        settles(data(&mut stream)).await.unwrap().committed.position,
        second
    );
    caught_up(&mut stream).await;
    runtime.live_read_revocations().pop().unwrap().revoke();
    assert!(matches!(
        stream.next().await.unwrap(),
        Err(SessionError::SubscriptionRevoked)
    ));
    let third = author.submit(submission(b"author remains")).await.unwrap();
    let root = author.put_blob(Bytes::new()).await.unwrap();
    let at_event = author.resolve_position(third).await.unwrap().unwrap();
    author
        .publish_snapshot(Some(first), None, Snapshot { root, at_event })
        .await
        .unwrap();
    assert_eq!(
        author
            .get_snapshot(LoadStart::LatestSnapshot)
            .await
            .unwrap()
            .unwrap()
            .at_event
            .id(),
        third
    );
}

#[tokio::test]
async fn cache_enabled_memory_sessions_satisfy_session_conformance() {
    let storage = MemoryStorage::new();
    let (_, view) = storage.create_view().await.unwrap();
    let runtime = LocalSequencer::<MemoryStorage>::recover_with_live_cache(view)
        .await
        .unwrap();
    let first = member(&runtime).await;
    let second = member(&runtime).await;
    settles(sea_conformance::run_session_conformance(&first, &second)).await;
}

#[tokio::test]
async fn shutdown_preserves_memory_reopening_with_unpolled_closed_live_and_historical_reads() {
    let storage = MemoryStorage::new();
    let (id, view) = storage.create_view().await.unwrap();
    let runtime = LocalSequencer::<MemoryStorage>::recover_with_live_cache(view)
        .await
        .unwrap();
    let author = member(&runtime).await;
    let mut live = author.read(None, None);
    live.next().await.unwrap().unwrap();
    author.submit(submission(b"history")).await.unwrap();
    let mut historical = author.read(None, None);
    historical.next().await.unwrap().unwrap();
    assert_eq!(runtime.live_cache_stats().unwrap().subscriptions, 2);
    runtime.shutdown().await.unwrap();
    assert_eq!(runtime.live_cache_stats().unwrap().subscriptions, 0);
    let reopened = storage.open_view(&id).await.unwrap().unwrap();
    assert!(matches!(
        live.next().await.unwrap(),
        Err(SessionError::Closed)
    ));
    assert!(matches!(
        historical.next().await.unwrap(),
        Err(SessionError::Closed)
    ));
    drop(reopened);
}

#[tokio::test]
async fn recovery_never_retains_history_and_invalidated_openings_cannot_rejoin() {
    let storage = FaultStorage::default();
    let (id, view) = storage.create_view().await.unwrap();
    let runtime = LocalSequencer::<FaultStorage>::recover(view).await.unwrap();
    let author = member(&runtime).await;
    author
        .announce_membership(Bytes::from_static(b"member"))
        .await
        .unwrap();
    author.submit(submission(b"history")).await.unwrap();
    drop((author, runtime));
    let view = storage.open_view(&id).await.unwrap().unwrap();
    let runtime = LocalSequencer::<FaultStorage>::recover_with_live_cache(view)
        .await
        .unwrap();
    let stats = runtime.live_cache_stats().unwrap();
    assert_eq!(
        (
            stats.subscriptions,
            stats.entries,
            stats.payload_bytes,
            stats.entry_capacity
        ),
        (0, 0, 0, 0)
    );
    let observer = member(&runtime).await;
    let mut stream = observer.read(None, None);
    for kind in [
        SessionEventKind::Joined,
        SessionEventKind::Application,
        SessionEventKind::Left,
    ] {
        assert_eq!(settles(data(&mut stream)).await.unwrap().kind, kind);
    }
    caught_up(&mut stream).await;
    storage
        .events
        .invalidation
        .invalidate(FaultError::Injected(ErrorKind::Unavailable));
    assert_eq!(runtime.live_cache_stats().unwrap().subscriptions, 0);
    let mut late = observer.read(None, None);
    assert!(matches!(
        late.next().await.unwrap(),
        Err(SessionError::StorageInvalidated(_))
    ));
    assert_eq!(runtime.live_cache_stats().unwrap().subscriptions, 0);
    drop((late, stream, observer, runtime));
    let view = storage.open_view(&id).await.unwrap().unwrap();
    assert!(matches!(
        LocalSequencer::<FaultStorage>::recover_with_live_cache(view).await,
        Err(SessionError::StorageInvalidated(_))
    ));
}

#[tokio::test]
async fn unpolled_cache_claims_do_not_gate_writes_reference_floor_controls_or_shutdown() {
    let (_, runtime) = fixture().await;
    let author = member(&runtime).await;
    let observer = member(&runtime).await;
    let mut stalled = observer.read(None, None);
    caught_up(&mut stalled).await;
    let mut reference = None;
    for _ in 0..1152 {
        let mut event = submission(b"x");
        event.reference = reference;
        reference = Some(settles(author.submit(event)).await.unwrap());
    }
    assert!(runtime.runtime.lock().await.minimum_reference.is_some());
    assert_eq!(runtime.live_cache_stats().unwrap().entries, 1152);
    settles(author.announce_membership(Bytes::new()))
        .await
        .unwrap();
    settles(author.close()).await.unwrap();
    assert_eq!(runtime.live_cache_stats().unwrap().entries, 1154);
    settles(runtime.shutdown()).await.unwrap();
    assert_eq!(runtime.live_cache_stats().unwrap().payload_bytes, 0);
    assert!(matches!(
        stalled.next().await.unwrap(),
        Err(SessionError::Closed)
    ));
}

#[tokio::test]
async fn parked_control_driver_releases_guards_and_survives_another_cancelled_drainer() {
    let (storage, runtime) = fixture().await;
    let writer = member(&runtime).await;
    let observer = member(&runtime).await;
    let mut stream = observer.read(None, None);
    caught_up(&mut stream).await;
    storage.events.arm(Failure::GateBefore);
    let mut join = Box::pin(writer.announce_membership(Bytes::new()));
    assert!(join.as_mut().now_or_never().is_none());
    drop(join);
    let counter = Arc::new(WakeCounter::default());
    let waker = futures_util::task::waker(counter.clone());
    let mut waiting = Box::pin(data(&mut stream));
    assert!(
        waiting
            .as_mut()
            .poll(&mut std::task::Context::from_waker(&waker))
            .is_pending()
    );
    assert!(
        runtime.runtime.try_lock().is_ok(),
        "control polling must release runtime ownership before Pending"
    );
    assert!(
        runtime.pipeline.gate.try_write().is_ok(),
        "control polling must release lifecycle ownership before Pending"
    );
    let mut competing = Box::pin(observer.get_snapshot(LoadStart::Beginning));
    assert!(competing.as_mut().now_or_never().is_none());
    drop(competing);
    counter.0.store(0, Ordering::SeqCst);
    storage.events.release.notify_one();
    assert!(
        counter.0.load(Ordering::SeqCst) > 0,
        "the last cancelled drainer must not steal cached-reader readiness"
    );
    let joined = settles(waiting).await.unwrap();
    assert_eq!(joined.kind, SessionEventKind::Joined);
    assert_eq!(storage.events.calls.load(Ordering::SeqCst), 1);
}
