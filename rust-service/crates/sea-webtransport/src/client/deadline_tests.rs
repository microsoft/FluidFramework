//! Controlled-clock evidence for native timeout ownership and idle subscriptions.

use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use async_trait::async_trait;
use futures_util::FutureExt;
use tokio::{
    sync::mpsc,
    time::{Instant, advance},
};

use super::*;

/// Short virtual-time budget shared by each controlled transport.
const BUDGET: Duration = Duration::from_secs(5);

/// Observable byte-stream calls, independent of protocol interpretation.
#[derive(Default)]
struct Calls {
    /// Exact outbound frames, used to reject automatic retries.
    writes: Mutex<Vec<Vec<u8>>>,
    /// Whether cleanup explicitly cancelled the stream.
    cancelled: AtomicBool,
    /// Holds writes pending after recording their potentially admitted bytes.
    stall_send: AtomicBool,
    /// Releases a write after its configured stall.
    send_ready: tokio::sync::Notify,
    /// Holds send-side finish pending.
    stall_finish: AtomicBool,
}

/// Channel-backed byte stream with independently stallable operations.
struct ProbeStream {
    /// Peer-controlled chunks; an empty live channel stays pending.
    incoming: mpsc::UnboundedReceiver<Vec<u8>>,
    /// Observed calls and configured stalls.
    calls: Arc<Calls>,
}

#[async_trait]
impl BidirectionalStream for ProbeStream {
    type Error = crate::WebTransportError;

    async fn send(&mut self, bytes: &[u8]) -> Result<(), Self::Error> {
        self.calls.writes.lock().unwrap().push(bytes.to_vec());
        while self.calls.stall_send.load(Ordering::Relaxed) {
            self.calls.send_ready.notified().await;
        }
        Ok(())
    }

    async fn finish(&mut self) -> Result<(), Self::Error> {
        if self.calls.stall_finish.load(Ordering::Relaxed) {
            std::future::pending().await
        } else {
            Ok(())
        }
    }

    async fn receive(&mut self) -> Result<Option<Vec<u8>>, Self::Error> {
        Ok(self.incoming.recv().await)
    }

    async fn cancel(&mut self) -> Result<(), Self::Error> {
        self.calls.cancelled.store(true, Ordering::Relaxed);
        Ok(())
    }
}

/// One native-budget transport with a separately stallable stream admission.
struct ProbeTransport {
    /// Single stream consumed by the opening.
    stream: Mutex<Option<ProbeStream>>,
    /// Simulates exhausted peer stream credit.
    stall_open: bool,
    /// Configured duration, including extreme values in clock-range tests.
    budget: Duration,
}

#[async_trait]
impl ClientTransport for ProbeTransport {
    type Stream = ProbeStream;
    type Error = crate::WebTransportError;

    fn operation_timeout(&self) -> Option<Duration> {
        Some(self.budget)
    }

    async fn open_bidirectional(&self) -> Result<Self::Stream, Self::Error> {
        if self.stall_open {
            std::future::pending().await
        } else {
            Ok(self.stream.lock().unwrap().take().unwrap())
        }
    }

    fn disconnect(&self) -> Result<(), Self::Error> {
        Ok(())
    }
}

/// Creates an admitted-authority client and a peer that controls all response bytes.
fn probe() -> (
    Client<ProbeTransport>,
    mpsc::UnboundedSender<Vec<u8>>,
    Arc<Calls>,
) {
    let (outgoing, incoming) = mpsc::unbounded_channel();
    let calls = Arc::new(Calls::default());
    let state = Arc::new(ClientState::default());
    state.set_authority(vec![1; 32]).unwrap();
    (
        Client::with_state(
            ProbeTransport {
                stream: Mutex::new(Some(ProbeStream {
                    incoming,
                    calls: calls.clone(),
                })),
                stall_open: false,
                budget: BUDGET,
            },
            state,
            protocol::Limits::default(),
        ),
        outgoing,
        calls,
    )
}

#[tokio::test(start_paused = true)]
async fn deadlines_beyond_the_clock_range_do_not_panic() {
    let (mut client, peer, _) = probe();
    client.transport.budget = Duration::MAX;
    let mut stream = FramedStream::open(&client.transport, client.limits)
        .await
        .unwrap();
    assert!(stream.receive().now_or_never().is_none());
    stream.end_request();
    peer.send(vec![0]).unwrap();
    assert!(stream.receive().now_or_never().is_none());
}

/// Encodes a response using the same limits as the controlled client.
fn frame(role: StreamRole, response: &Response) -> Vec<u8> {
    protocol::encode_response_frame(role, response, protocol::Limits::default()).unwrap()
}

/// Opens an event subscription with a deterministic authority response.
fn event_opening() -> Request {
    Request::OpenEventStream {
        version: protocol::PROTOCOL_VERSION,
        archive: b"archive".to_vec(),
        intent: protocol::ArchiveIntent::Open,
        resume_after: None,
    }
}

/// Opens independent signal membership without requiring a real service.
fn signal_opening() -> protocol::signals::OpenSignals {
    protocol::signals::OpenSignals {
        version: protocol::PROTOCOL_VERSION,
        document: b"archive".to_vec(),
        member: protocol::signals::Member {
            id: vec![1],
            metadata: vec![],
        },
        datagrams: false,
    }
}

#[tokio::test(start_paused = true)]
async fn every_logical_opening_and_snapshot_initial_state_have_a_deadline() {
    for role in [
        StreamRole::Event,
        StreamRole::Author,
        StreamRole::Content,
        StreamRole::Snapshot,
        StreamRole::Signal,
    ] {
        let (client, _peer, calls) = probe();
        let start = Instant::now();
        let result = match role {
            StreamRole::Event => client.open_event_stream(event_opening()).await.map(|_| ()),
            StreamRole::Author => client.open_author_stream().await.map(|_| ()),
            StreamRole::Content => client.open_content_stream().await.map(|_| ()),
            StreamRole::Snapshot => client
                .open_snapshot_stream(protocol::SnapshotParticipation::ReadOnly)
                .await
                .map(|_| ()),
            StreamRole::Signal => client
                .open_signal_stream(signal_opening())
                .await
                .map(|_| ()),
        };
        assert!(
            matches!(result, Err(ClientError::Timeout)),
            "{role:?}: {result:?}"
        );
        assert_eq!(Instant::now() - start, BUDGET);
        assert!(calls.cancelled.load(Ordering::Relaxed));

        let (client, peer, calls) = probe();
        peer.send(frame(StreamRole::Signal, &Response::Acknowledged))
            .unwrap();
        let mut signal = client.open_signal_stream(signal_opening()).await.unwrap();
        assert!(matches!(signal.next().await, Err(ClientError::Timeout)));
        assert!(calls.cancelled.load(Ordering::Relaxed));
    }
    let (client, peer, calls) = probe();
    peer.send(frame(StreamRole::Snapshot, &Response::Acknowledged))
        .unwrap();
    assert!(matches!(
        client
            .open_snapshot_stream(protocol::SnapshotParticipation::ReadOnly)
            .await,
        Err(ClientError::Timeout)
    ));
    assert!(calls.cancelled.load(Ordering::Relaxed));
}

#[tokio::test(start_paused = true)]
async fn opening_send_and_finish_are_bounded_and_cancelled() {
    for stage in ["open", "send", "finish"] {
        let (mut client, _peer, calls) = probe();
        client.transport.stall_open = stage == "open";
        calls.stall_send.store(stage == "send", Ordering::Relaxed);
        calls
            .stall_finish
            .store(stage == "finish", Ordering::Relaxed);
        let start = Instant::now();
        assert!(matches!(
            client.open_event_stream(event_opening()).await,
            Err(ClientError::Timeout)
        ));
        assert_eq!(Instant::now() - start, BUDGET);
        assert_eq!(calls.cancelled.load(Ordering::Relaxed), stage != "open");
    }
}

#[tokio::test(start_paused = true)]
async fn idle_receives_survive_cancellation_but_partial_frames_do_not_reset_the_clock() {
    let (client, peer, calls) = probe();
    let mut stream = FramedStream::open(&client.transport, client.limits)
        .await
        .unwrap();
    stream.end_request();
    assert!(stream.receive().now_or_never().is_none());
    advance(BUDGET * 3).await;
    assert!(stream.receive().now_or_never().is_none());
    let encoded = frame(StreamRole::Content, &Response::Acknowledged);
    peer.send(encoded[..1].to_vec()).unwrap();
    assert!(stream.receive().now_or_never().is_none());
    advance(Duration::from_secs(4)).await;
    peer.send(encoded[1..2].to_vec()).unwrap();
    assert!(stream.receive().now_or_never().is_none());
    advance(Duration::from_secs(1)).await;
    assert!(matches!(stream.receive().await, Err(ClientError::Timeout)));
    assert!(calls.cancelled.load(Ordering::Relaxed));
    assert!(matches!(
        stream.receive().await,
        Err(ClientError::State(ClientStateError::Closed))
    ));
}

#[tokio::test(start_paused = true)]
async fn author_timeouts_are_ambiguous_terminal_and_never_retried() {
    for stall_send in [false, true] {
        let (client, peer, calls) = probe();
        peer.send(frame(StreamRole::Author, &Response::Acknowledged))
            .unwrap();
        let mut author = client.open_author_stream().await.unwrap();
        calls.stall_send.store(stall_send, Ordering::Relaxed);
        let request = Request::Submit {
            reference: None,
            event: protocol::Event {
                payload: vec![7],
                blob_tree: None,
            },
        };
        let result = author.request(request.clone()).await;
        assert!(matches!(result, Err(ClientError::AmbiguousTimeout)));
        let error = crate::SeaClientError::from(result.unwrap_err());
        assert_eq!(
            sea_core::ClassifiedError::kind(&error),
            sea_core::ErrorKind::Ambiguous
        );
        assert!(calls.cancelled.load(Ordering::Relaxed));
        peer.send(frame(
            StreamRole::Author,
            &Response::EventCommitted { position: 1 },
        ))
        .unwrap();
        assert!(matches!(
            author.request(request).await,
            Err(ClientError::State(ClientStateError::Closed))
        ));
        assert_eq!(calls.writes.lock().unwrap().len(), 2);
    }
}

#[tokio::test(start_paused = true)]
async fn author_close_uses_protocol_ack_without_waiting_for_transport_finish() {
    let (client, peer, calls) = probe();
    peer.send(frame(StreamRole::Author, &Response::Acknowledged))
        .unwrap();
    let author = client.open_author_stream().await.unwrap();
    calls.stall_finish.store(true, Ordering::Relaxed);
    peer.send(frame(StreamRole::Author, &Response::Acknowledged))
        .unwrap();
    let start = Instant::now();
    author.finish().await.unwrap();
    assert_eq!(Instant::now(), start);
    assert_eq!(calls.writes.lock().unwrap().len(), 2);
}

#[tokio::test(start_paused = true)]
async fn content_requires_completion_within_one_budget() {
    let (client, peer, calls) = probe();
    peer.send(frame(StreamRole::Content, &Response::Acknowledged))
        .unwrap();
    let mut content = client.open_content_stream().await.unwrap();
    peer.send(frame(StreamRole::Content, &Response::Blob(vec![7])))
        .unwrap();
    let start = Instant::now();
    assert!(matches!(
        content.request(Request::GetBlob { id: [0; 32] }).await,
        Err(ClientError::Timeout)
    ));
    assert_eq!(Instant::now() - start, BUDGET);
    assert!(calls.cancelled.load(Ordering::Relaxed));
    assert!(matches!(
        content.request(Request::GetBlob { id: [0; 32] }).await,
        Err(ClientError::State(ClientStateError::Closed))
    ));
}

#[tokio::test(start_paused = true)]
async fn finite_requests_reset_between_exchanges_but_not_between_write_and_read() {
    let (client, peer, calls) = probe();
    peer.send(frame(StreamRole::Content, &Response::Acknowledged))
        .unwrap();
    let mut content = client.open_content_stream().await.unwrap();
    let request = Request::GetBlob { id: [0; 32] };
    for _ in 0..2 {
        advance(BUDGET * 2).await;
        peer.send(frame(StreamRole::Content, &Response::Blob(vec![7])))
            .unwrap();
        peer.send(frame(StreamRole::Content, &Response::ResponseComplete))
            .unwrap();
        assert_eq!(
            content.request(request.clone()).await.unwrap(),
            vec![Response::Blob(vec![7])]
        );
    }
    calls.stall_send.store(true, Ordering::Relaxed);
    let mut pending = Box::pin(content.request(request));
    assert!(pending.as_mut().now_or_never().is_none());
    advance(Duration::from_secs(4)).await;
    calls.stall_send.store(false, Ordering::Relaxed);
    calls.send_ready.notify_one();
    assert!(pending.as_mut().now_or_never().is_none());
    advance(Duration::from_secs(1)).await;
    assert!(matches!(
        pending.as_mut().now_or_never(),
        Some(Err(ClientError::Timeout))
    ));
    drop(pending);
    assert!(calls.cancelled.load(Ordering::Relaxed));
}

#[tokio::test(start_paused = true)]
async fn buffered_subscription_frames_do_not_expire_while_the_consumer_is_idle() {
    let (client, peer, _) = probe();
    let mut stream = FramedStream::open(&client.transport, client.limits)
        .await
        .unwrap();
    stream.end_request();
    let encoded = frame(StreamRole::Content, &Response::Acknowledged);
    peer.send([encoded.clone(), encoded].concat()).unwrap();
    assert!(stream.receive().await.unwrap().is_some());
    advance(BUDGET * 3).await;
    assert!(stream.receive().await.unwrap().is_some());
}

#[tokio::test(start_paused = true)]
async fn interleaved_snapshot_notifications_cannot_extend_publication_budget() {
    let (client, peer, calls) = probe();
    peer.send(frame(StreamRole::Snapshot, &Response::Acknowledged))
        .unwrap();
    let notification = frame(
        StreamRole::Snapshot,
        &Response::SnapshotCoordination {
            latest: None,
            fence: None,
        },
    );
    peer.send(notification.clone()).unwrap();
    let mut snapshot = client
        .open_snapshot_stream(protocol::SnapshotParticipation::ReadOnly)
        .await
        .unwrap();
    assert!(snapshot.next_coordination().now_or_never().is_none());
    advance(BUDGET * 2).await;
    peer.send(notification.clone()).unwrap();
    snapshot.next_coordination().await.unwrap();
    let request = Request::PublishSnapshot {
        fence: None,
        expected_parent: None,
        at_event: 1,
        root: protocol::TreeId::Directory([0; 32]),
    };
    let mut pending = Box::pin(snapshot.request(request));
    assert!(pending.as_mut().now_or_never().is_none());
    advance(Duration::from_secs(4)).await;
    peer.send(notification).unwrap();
    assert!(pending.as_mut().now_or_never().is_none());
    advance(Duration::from_secs(1)).await;
    assert!(matches!(pending.await, Err(ClientError::AmbiguousTimeout)));
    assert!(calls.cancelled.load(Ordering::Relaxed));
}

#[tokio::test(start_paused = true)]
async fn interleaved_signals_cannot_extend_request_budget() {
    let (client, peer, calls) = probe();
    peer.send(frame(StreamRole::Signal, &Response::Acknowledged))
        .unwrap();
    let mut signal = client.open_signal_stream(signal_opening()).await.unwrap();
    let notification = frame(
        StreamRole::Signal,
        &Response::SignalEvent(protocol::signals::Event::Members(vec![])),
    );
    peer.send(notification.clone()).unwrap();
    signal.next().await.unwrap();
    assert!(signal.next().now_or_never().is_none());
    advance(BUDGET * 2).await;
    peer.send(notification.clone()).unwrap();
    signal.next().await.unwrap();
    let mut received = 0;
    let mut pending = Box::pin(signal.request(
        Request::SendSignal(protocol::signals::Submission {
            target: None,
            payload: vec![1],
            best_effort: false,
        }),
        |_| {
            received += 1;
            Ok(())
        },
    ));
    assert!(pending.as_mut().now_or_never().is_none());
    advance(Duration::from_secs(4)).await;
    peer.send(notification).unwrap();
    assert!(pending.as_mut().now_or_never().is_none());
    advance(Duration::from_secs(1)).await;
    assert!(matches!(pending.await, Err(ClientError::Timeout)));
    assert_eq!(received, 1);
    assert!(calls.cancelled.load(Ordering::Relaxed));
}

#[tokio::test(start_paused = true)]
async fn event_and_content_read_subscriptions_remain_idle_after_admission() {
    for event in [false, true] {
        let (client, peer, calls) = probe();
        let role = if event {
            StreamRole::Event
        } else {
            StreamRole::Content
        };
        peer.send(frame(
            role,
            &if event {
                Response::EventStreamOpened {
                    session: 1,
                    document: vec![1],
                    authority: vec![1; 32],
                }
            } else {
                Response::Acknowledged
            },
        ))
        .unwrap();
        let mut responses = if event {
            client
                .open_event_stream(event_opening())
                .await
                .unwrap()
                .into_responses()
        } else {
            client
                .open_content_stream()
                .await
                .unwrap()
                .request_stream(Request::Read {
                    after: None,
                    stop_after: None,
                })
                .await
                .unwrap()
        };
        let progress = frame(
            role,
            &Response::StreamProgress {
                previous: None,
                latest_known: None,
                status: protocol::StreamStatus::AwaitingNewItems,
            },
        );
        peer.send(progress.clone()).unwrap();
        assert!(responses.next().await.unwrap().is_some());
        assert!(responses.next().now_or_never().is_none());
        advance(BUDGET * 3).await;
        peer.send(progress).unwrap();
        assert!(responses.next().await.unwrap().is_some());
        assert!(!calls.cancelled.load(Ordering::Relaxed));
    }
}
