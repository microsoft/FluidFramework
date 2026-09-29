//! Benchmark-only pipelined Sea author traffic over independently owned QUIC directions.

use super::{Configuration, MeasurementClock, State, payload, protocol, subscription_was_shed};
use bytes::Bytes;
use futures_util::TryFutureExt as _;
use sea_webtransport::SeaClientError;
use serde_json::{Value, json};
use std::{
    future::Future,
    io::{BufRead as _, Write as _},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncWrite, AsyncWriteExt as _},
    task::JoinSet,
};
use wtransport::{ClientConfig, Connection, Endpoint, RecvStream, endpoint::endpoint_side::Client};

type Result<T> = std::result::Result<T, String>;

fn drain_timeout(seconds: Option<u64>) -> Result<Duration> {
    let seconds = seconds.unwrap_or(30);
    if !(1..=120).contains(&seconds) {
        return Err("streamed drain timeout must be between 1 and 120 seconds".to_owned());
    }
    Ok(Duration::from_secs(seconds))
}

/// Endpoint ownership must survive every stream on its connection.
struct Owner {
    _endpoint: Endpoint<Client>,
    connection: Connection,
}

fn connection_stats(owners: &[Owner]) -> Vec<Value> {
    owners
        .iter()
        .map(|owner| {
            let stats = owner.connection.quic_connection().stats();
            json!({
                "rttMicros": stats.path.rtt.as_micros(),
                "congestionWindow": stats.path.cwnd,
                "lostPackets": stats.path.lost_packets,
                "sentPackets": stats.path.sent_packets,
                "congestionEvents": stats.path.congestion_events,
                "sentBytes": stats.udp_tx.bytes,
                "receivedBytes": stats.udp_rx.bytes,
                "sentStreamFrames": stats.frame_tx.stream,
                "receivedStreamFrames": stats.frame_rx.stream,
            })
        })
        .collect()
}

/// Retains partial and coalesced protocol frames without an application receive queue.
struct Responses {
    receive: RecvStream,
    decoder: protocol::NetworkFrameDecoder,
    role: protocol::StreamRole,
}

impl Responses {
    fn new(receive: RecvStream, role: protocol::StreamRole) -> Self {
        Self {
            receive,
            decoder: protocol::NetworkFrameDecoder::new(protocol::Limits::default()),
            role,
        }
    }

    async fn next(&mut self) -> Result<protocol::Response> {
        loop {
            if let Some(frame) = self
                .decoder
                .next_frame()
                .map_err(|error| error.to_string())?
            {
                return protocol::decode_response_network_frame(self.role, &frame)
                    .map_err(|error| error.to_string());
            }
            let mut buffer = [0; 8192];
            let count = self
                .receive
                .read(&mut buffer)
                .await
                .map_err(|error| error.to_string())?
                .ok_or("unexpected response EOF")?;
            self.decoder.push(&buffer[..count]);
        }
    }
}

fn encode(role: protocol::StreamRole, request: &protocol::Request) -> Result<Vec<u8>> {
    protocol::encode_request_frame(role, request, protocol::Limits::default())
        .map_err(|error| error.to_string())
}

/// Uses the production client's certificate-pinned connection defaults.
async fn open(
    configuration: &Configuration,
    document: Vec<u8>,
) -> Result<(Owner, Responses, Vec<u8>, Vec<u8>)> {
    let endpoint = Endpoint::client(
        ClientConfig::builder()
            .with_bind_default()
            .with_server_certificate_hashes([configuration
                .certificate_hash
                .parse()
                .map_err(|error| format!("certificate hash: {error}"))?])
            .build(),
    )
    .map_err(|error| error.to_string())?;
    let connection = endpoint
        .connect(&configuration.endpoint)
        .await
        .map_err(|error| error.to_string())?;
    let (mut send, receive) = connection
        .open_bi()
        .await
        .map_err(|error| error.to_string())?
        .await
        .map_err(|error| error.to_string())?;
    let bytes = encode(
        protocol::StreamRole::Event,
        &protocol::Request::OpenEventStream {
            version: protocol::PROTOCOL_VERSION,
            intent: if document.is_empty() {
                protocol::ArchiveIntent::Create
            } else {
                protocol::ArchiveIntent::Open
            },
            archive: document,
            resume_after: None,
        },
    )?;
    send.write_all(&bytes)
        .await
        .map_err(|error| error.to_string())?;
    send.finish().await.map_err(|error| error.to_string())?;
    let mut responses = Responses::new(receive, protocol::StreamRole::Event);
    let protocol::Response::EventStreamOpened {
        document,
        authority,
        ..
    } = responses.next().await?
    else {
        return Err("missing event-stream authority".to_owned());
    };
    loop {
        match responses.next().await? {
            protocol::Response::StreamProgress {
                status: protocol::StreamStatus::AwaitingNewItems,
                ..
            } => break,
            protocol::Response::StreamProgress { .. } => {}
            response => return Err(format!("unexpected initial event response: {response:?}")),
        }
    }
    Ok((
        Owner {
            _endpoint: endpoint,
            connection,
        },
        responses,
        authority,
        document,
    ))
}

/// Separates transport write completion from acknowledgment; no acknowledgment future is polled here.
async fn transport_write<T>(future: impl Future<Output = T>) -> (T, bool, Duration) {
    let started = Instant::now();
    let mut pending = false;
    tokio::pin!(future);
    let result = futures_util::future::poll_fn(|context| {
        let poll = future.as_mut().poll(context);
        if poll.is_pending() {
            pending = true;
        }
        poll
    })
    .await;
    (result, pending, started.elapsed())
}

/// One generated frame may be waiting for QUIC capacity; all earlier frames are transport-owned.
#[derive(Default)]
struct Tracking {
    common: State,
    written: usize,
    frame_bytes: usize,
    max_outstanding: usize,
    pending_write_calls: usize,
    pending_write_seconds: f64,
    sending_done: bool,
    last_receipt: Option<u64>,
}

impl Tracking {
    fn outstanding(&self) -> usize {
        self.common.times.len() - self.common.acknowledged
    }

    fn receipt(
        &mut self,
        position: u64,
        now: Instant,
        warm_end: Instant,
        end: Instant,
        clock: MeasurementClock,
    ) -> Result<()> {
        if self.common.acknowledged >= self.common.times.len()
            || self
                .last_receipt
                .is_some_and(|previous| position <= previous)
        {
            return Err("unsolicited, duplicate, or reordered acknowledgment".to_owned());
        }
        let sent_at = self.common.times[self.common.acknowledged].0;
        self.common.acknowledge(sent_at, now, warm_end, end, clock);
        self.last_receipt = Some(position);
        Ok(())
    }
}

/// Sends complete frames without waiting for receipts, stopping at the deadline or timing-record cap.
/// Only successful complete writes contribute transport-written and pending-call telemetry.
async fn write<Writer: AsyncWrite + Unpin>(
    send: Arc<tokio::sync::Mutex<Writer>>,
    state: Arc<Mutex<Tracking>>,
    payload_bytes: usize,
    limit: usize,
    warm_end: Instant,
    end: Instant,
) -> Result<()> {
    let mut send = send.lock().await;
    while Instant::now() < end {
        let sequence = state.lock().expect("tracking lock").common.times.len() + 1;
        if sequence > limit {
            return Err("bounded timing-record limit reached".to_owned());
        }
        let frame = encode(
            protocol::StreamRole::Author,
            &protocol::Request::Submit {
                reference: None,
                event: protocol::Event {
                    payload: payload(sequence, payload_bytes).to_vec(),
                    blob_tree: None,
                },
            },
        )?;
        {
            let mut state = state.lock().expect("tracking lock");
            let now = Instant::now();
            if now >= end {
                break;
            }
            if state.frame_bytes != 0 && state.frame_bytes != frame.len() {
                return Err(
                    "variable frame size invalidates outstanding-byte accounting".to_owned(),
                );
            }
            state.frame_bytes = frame.len();
            state.common.times.push((now, now >= warm_end));
            state.max_outstanding = state.max_outstanding.max(state.outstanding());
        }
        // Complete a frame started before the deadline; cancelling a partial frame is not success.
        let (result, pending, elapsed) = transport_write(send.write_all(&frame)).await;
        result.map_err(|error| error.to_string())?;
        {
            let mut state = state.lock().expect("tracking lock");
            state.written += 1;
            if pending {
                state.pending_write_calls += 1;
                state.pending_write_seconds += elapsed.as_secs_f64();
            }
        }
        tokio::task::consume_budget().await;
    }
    state.lock().expect("tracking lock").sending_done = true;
    Ok(())
}

async fn receipts(
    mut responses: Responses,
    state: Arc<Mutex<Tracking>>,
    warm_end: Instant,
    end: Instant,
    clock: MeasurementClock,
) -> Result<()> {
    loop {
        match responses.next().await? {
            protocol::Response::EventCommitted { position } => {
                state.lock().expect("tracking lock").receipt(
                    position,
                    Instant::now(),
                    warm_end,
                    end,
                    clock,
                )?;
            }
            response => return Err(format!("author stream failed: {response:?}")),
        }
    }
}

async fn read(
    mut responses: Responses,
    state: Arc<Mutex<Tracking>>,
    recipient: usize,
    payload_bytes: usize,
    window: std::ops::Range<Instant>,
    clock: MeasurementClock,
) -> Result<()> {
    loop {
        match responses.next().await? {
            protocol::Response::LoadEvent(event)
                if event.kind == protocol::SessionEventKind::Application =>
            {
                state.lock().expect("tracking lock").common.observe(
                    recipient,
                    &Bytes::from(event.event.payload),
                    payload_bytes,
                    Instant::now(),
                    window.clone(),
                    clock,
                )?;
            }
            protocol::Response::StreamProgress { .. } | protocol::Response::LoadEvent(_) => {}
            protocol::Response::Error { kind, message }
                if subscription_was_shed(&SeaClientError::Service(kind, message.clone())) =>
            {
                state.lock().expect("tracking lock").common.shed[recipient] = true;
                return Ok(());
            }
            response => return Err(format!("event stream failed: {response:?}")),
        }
    }
}

fn completed_tasks(tasks: &mut JoinSet<Result<()>>) -> Result<()> {
    while let Some(result) = tasks.try_join_next() {
        result.map_err(|error| error.to_string())??;
    }
    Ok(())
}

/// Preserves timestamps and exact drain checks while moving author transmission off acknowledgment pacing.
#[allow(
    clippy::too_many_lines,
    reason = "Keeps benchmark startup, task ownership, sampling, and cleanup together"
)]
pub(super) async fn measure(configuration: &Configuration) -> Result<Value> {
    let drain_timeout = drain_timeout(configuration.drain_timeout_seconds)?;
    let mut owners = Vec::new();
    let mut streams = Vec::new();
    for _ in 0..configuration.documents {
        let (owner, echo, authority, document) =
            tokio::time::timeout(Duration::from_secs(30), open(configuration, Vec::new()))
                .await
                .map_err(|error| error.to_string())??;
        let (observer, events, _, _) =
            tokio::time::timeout(Duration::from_secs(30), open(configuration, document))
                .await
                .map_err(|error| error.to_string())??;
        let (mut send, receive) = owner
            .connection
            .open_bi()
            .await
            .map_err(|error| error.to_string())?
            .await
            .map_err(|error| error.to_string())?;
        send.write_all(&encode(
            protocol::StreamRole::Author,
            &protocol::Request::OpenAuthorStream { authority },
        )?)
        .await
        .map_err(|error| error.to_string())?;
        let mut acknowledgments = Responses::new(receive, protocol::StreamRole::Author);
        if acknowledgments.next().await? != protocol::Response::Acknowledged {
            return Err("author opening refused".to_owned());
        }
        streams.push((
            Arc::new(tokio::sync::Mutex::new(send)),
            acknowledgments,
            echo,
            events,
        ));
        owners.extend([owner, observer]);
    }
    println!("{}", json!({"type":"ready"}));
    std::io::stdout()
        .flush()
        .map_err(|error| error.to_string())?;
    let mut line = String::new();
    std::io::stdin()
        .lock()
        .read_line(&mut line)
        .map_err(|error| error.to_string())?;
    if line.trim().is_empty() {
        return Err("missing start signal".to_owned());
    }
    let clock = MeasurementClock::new();
    let started = Instant::now();
    let warm_end = started + Duration::from_secs(configuration.warmup_seconds);
    let end = warm_end + Duration::from_secs(configuration.seconds);
    let mut tasks = JoinSet::new();
    let mut states = Vec::new();
    let mut send_owners = Vec::new();
    for (document, (send, acknowledgments, echo, events)) in streams.into_iter().enumerate() {
        let state = Arc::new(Mutex::new(Tracking::default()));
        tasks.spawn(
            write(
                send.clone(),
                state.clone(),
                configuration.payload_bytes,
                1_000_000 / configuration.documents,
                warm_end,
                end,
            )
            .map_err(move |error| format!("document {document} writer: {error}")),
        );
        tasks.spawn(
            receipts(acknowledgments, state.clone(), warm_end, end, clock)
                .map_err(move |error| format!("document {document} receipts: {error}")),
        );
        tasks.spawn(
            read(
                echo,
                state.clone(),
                0,
                configuration.payload_bytes,
                warm_end..end,
                clock,
            )
            .map_err(move |error| format!("document {document} echo: {error}")),
        );
        tasks.spawn(
            read(
                events,
                state.clone(),
                1,
                configuration.payload_bytes,
                warm_end..end,
                clock,
            )
            .map_err(move |error| format!("document {document} observer: {error}")),
        );
        states.push(state);
        send_owners.push(send);
    }
    let mut backlog = Vec::new();
    let mut outstanding_at_end: Option<usize> = None;
    let mut outstanding_bytes_at_end: Option<usize> = None;
    let execution: Result<()> = async {
        while Instant::now() < end {
            completed_tasks(&mut tasks)?;
            let mut outstanding = 0;
            let mut outstanding_bytes = 0;
            let mut written = 0;
            let mut acknowledged = 0;
            for state in &states {
                let state = state.lock().expect("tracking lock");
                outstanding += state.outstanding();
                outstanding_bytes += state.outstanding() * state.frame_bytes;
                written += state.written;
                acknowledged += state.common.acknowledged;
            }
            backlog.push(
                json!({"seconds":started.elapsed().as_secs_f64(),"outstanding":outstanding,
            "outstandingBytes":outstanding_bytes,"written":written,"acknowledged":acknowledged,
            "connections":connection_stats(&owners)}),
            );
            tokio::time::sleep_until(tokio::time::Instant::from_std(
                (Instant::now() + Duration::from_millis(250)).min(end),
            ))
            .await;
        }
        outstanding_at_end = Some(
            states
                .iter()
                .map(|state| state.lock().expect("tracking lock").outstanding())
                .sum(),
        );
        outstanding_bytes_at_end = Some(
            states
                .iter()
                .map(|state| {
                    let state = state.lock().expect("tracking lock");
                    state.outstanding() * state.frame_bytes
                })
                .sum(),
        );
        let drain_deadline = end + drain_timeout;
        loop {
            completed_tasks(&mut tasks)?;
            if states.iter().all(|state| {
                let state = state.lock().expect("tracking lock");
                state.sending_done
                    && state.common.drained()
                    && state.written == state.common.times.len()
            }) {
                break;
            }
            if Instant::now() >= drain_deadline {
                return Err(format!(
                    "streamed workload did not drain within {} seconds",
                    drain_timeout.as_secs()
                ));
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        Ok(())
    }
    .await;
    let mut errors: Vec<String> = execution.err().into_iter().collect();
    let drain_seconds = Instant::now().saturating_duration_since(end).as_secs_f64();
    tasks.abort_all();
    while let Some(result) = tasks.join_next().await {
        match result {
            Ok(Err(error)) => errors.push(error),
            Err(error) if !error.is_cancelled() => errors.push(error.to_string()),
            Ok(Ok(())) | Err(_) => {}
        }
    }
    let mut sent = 0;
    let mut written = 0;
    let mut acknowledged = 0;
    let mut measured_sent = 0;
    let mut acknowledged_in_window = 0;
    let mut delivered = 0;
    let mut missing = 0;
    let mut shed_missing = 0;
    let mut max_in_flight = 0;
    let mut max_outstanding_bytes = 0;
    let mut pending_write_calls = 0;
    let mut pending_write_seconds = 0.0;
    let mut ack_times = Vec::new();
    let mut delivery_times = Vec::new();
    let mut ack_latencies = Vec::new();
    let mut reader_outcomes = Vec::new();
    let mut document_outcomes = Vec::new();
    for (document, state) in states.iter().enumerate() {
        let mut state = state.lock().expect("tracking lock");
        document_outcomes.push(json!({
            "document": document,
            "sent": state.common.times.len(),
            "transportWritten": state.written,
            "acknowledged": state.common.acknowledged,
            "sendingDone": state.sending_done,
            "frameBytes": state.frame_bytes,
        }));
        sent += state.common.times.len();
        written += state.written;
        acknowledged += state.common.acknowledged;
        measured_sent += state
            .common
            .times
            .iter()
            .filter(|(_, measured)| *measured)
            .count();
        max_in_flight += state.max_outstanding;
        max_outstanding_bytes += state.max_outstanding * state.frame_bytes;
        pending_write_calls += state.pending_write_calls;
        pending_write_seconds += state.pending_write_seconds;
        acknowledged_in_window += state.common.acknowledged_in_window;
        delivered += state.common.delivered;
        ack_times.append(&mut state.common.acknowledgment_epoch_micros);
        delivery_times.append(&mut state.common.observer_delivery_epoch_micros);
        ack_latencies.append(&mut state.common.acknowledgment_latencies);
        for recipient in 0..2 {
            let undelivered = state.common.times.len() - state.common.observed[recipient];
            missing += undelivered;
            if state.common.shed[recipient] {
                shed_missing += undelivered;
            }
            reader_outcomes.push(json!({"document":document,"recipient":recipient,
                "shed":state.common.shed[recipient],"delivered":state.common.observed[recipient],"undelivered":undelivered,
                "receivedInWindow":state.common.observed_in_window[recipient]}));
        }
    }
    ack_latencies.sort_by(f64::total_cmp);
    let percentile = |percent: usize| {
        ack_latencies
            .get(
                (ack_latencies.len() * percent)
                    .div_ceil(100)
                    .saturating_sub(1),
            )
            .copied()
    };
    let transport_stats = connection_stats(&owners);
    drop((send_owners, owners));
    Ok(
        json!({"type":"result","sent":sent,"measuredSent":measured_sent,"transportWritten":written,"acknowledged":acknowledged,"acknowledgedInWindow":acknowledged_in_window,
        "deliveredInWindow":delivered,"errors":errors,"missing":missing,"shedMissing":shed_missing,"readerOutcomes":reader_outcomes,
        "documentCount":states.len(),"maxInFlight":max_in_flight,"maxOutstandingBytes":max_outstanding_bytes,
        "outstandingAtEnd":outstanding_at_end,"outstandingBytesAtEnd":outstanding_bytes_at_end,"drainSeconds":drain_seconds,
        "pendingTransportWriteCalls":pending_write_calls,"pendingTransportWriteSeconds":pending_write_seconds,
        "acknowledgmentEpochMicros":ack_times,"observerDeliveryEpochMicros":delivery_times,
        "acknowledgmentLatencyMilliseconds":{"median":percentile(50),"p95":percentile(95),"max":ack_latencies.last()},
        "measurementClock":clock.report(),"backlog":backlog,"transportStats":transport_stats,
        "documentOutcomes":document_outcomes}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::task::Poll;

    #[test]
    fn drain_override_remains_bounded_and_preserves_default() {
        assert_eq!(drain_timeout(None).unwrap(), Duration::from_secs(30));
        assert_eq!(drain_timeout(Some(120)).unwrap(), Duration::from_secs(120));
        assert!(drain_timeout(Some(0)).is_err());
        assert!(drain_timeout(Some(121)).is_err());
    }

    #[tokio::test]
    async fn writer_pipelines_until_transport_capacity_and_enforces_record_limit() {
        use tokio::io::AsyncReadExt as _;
        let frame = |sequence| {
            encode(
                protocol::StreamRole::Author,
                &protocol::Request::Submit {
                    reference: None,
                    event: protocol::Event {
                        payload: payload(sequence, 64).to_vec(),
                        blob_tree: None,
                    },
                },
            )
            .unwrap()
        };
        let first = frame(1);
        let (send, mut receive) = tokio::io::duplex(first.len());
        let state = Arc::new(Mutex::new(Tracking::default()));
        let now = Instant::now();
        let writer = write(
            Arc::new(tokio::sync::Mutex::new(send)),
            state.clone(),
            64,
            2,
            now,
            now + Duration::from_secs(30),
        );
        tokio::pin!(writer);
        assert!(matches!(futures_util::poll!(&mut writer), Poll::Pending));
        {
            let state = state.lock().unwrap();
            assert_eq!(state.common.times.len(), 2);
            assert_eq!(state.written, 1);
            assert_eq!(state.common.acknowledged, 0);
            assert_eq!(state.max_outstanding, 2);
            assert_eq!(state.frame_bytes, first.len());
            assert_eq!(state.pending_write_calls, 0);
            assert!(!state.sending_done);
        }
        let mut received = vec![0; first.len()];
        receive.read_exact(&mut received).await.unwrap();
        assert_eq!(received, first);
        assert_eq!(
            futures_util::poll!(&mut writer),
            Poll::Ready(Err("bounded timing-record limit reached".to_owned()))
        );
        receive.read_exact(&mut received).await.unwrap();
        assert_eq!(received, frame(2));
        let state = state.lock().unwrap();
        assert_eq!(state.common.times.len(), 2);
        assert_eq!(state.written, 2);
        assert_eq!(state.outstanding(), 2);
        assert_eq!(state.pending_write_calls, 1);
        assert!(!state.sending_done);
    }

    #[tokio::test]
    async fn writer_deadline_and_transport_failure_do_not_report_complete_frames() {
        let now = Instant::now();
        for expired in [true, false] {
            let (send, receive) = tokio::io::duplex(1);
            let state = Arc::new(Mutex::new(Tracking::default()));
            let writer = write(
                Arc::new(tokio::sync::Mutex::new(send)),
                state.clone(),
                64,
                2,
                now,
                if expired {
                    now
                } else {
                    now + Duration::from_secs(30)
                },
            );
            tokio::pin!(writer);
            if !expired {
                assert!(matches!(futures_util::poll!(&mut writer), Poll::Pending));
                assert_eq!(state.lock().unwrap().written, 0);
            }
            drop(receive);
            let result = writer.await;
            assert_eq!(result.is_ok(), expired);
            let state = state.lock().unwrap();
            assert_eq!(state.common.times.len(), usize::from(!expired));
            assert_eq!(state.written, 0);
            assert_eq!(state.common.acknowledged, 0);
            assert_eq!(state.pending_write_calls, 0);
            assert_eq!(state.pending_write_seconds.to_bits(), 0.0_f64.to_bits());
            assert_eq!(state.sending_done, expired);
        }
    }

    #[test]
    fn receipt_count_and_order_are_checked_independently_of_send_completion() {
        let now = Instant::now();
        let end = now + Duration::from_secs(1);
        let clock = MeasurementClock::new();
        let mut state = Tracking::default();
        assert!(state.receipt(1, now, now, end, clock).is_err());
        state.common.times.extend([(now, true); 2]);
        state.receipt(2, now, now, end, clock).unwrap();
        for position in [1, 2] {
            assert!(state.receipt(position, now, now, end, clock).is_err());
            assert_eq!(state.common.acknowledged, 1);
            assert_eq!(state.last_receipt, Some(2));
            assert_eq!(state.common.acknowledgment_epoch_micros.len(), 1);
        }
        state.receipt(3, now, now, end, clock).unwrap();
        assert!(state.receipt(4, now, now, end, clock).is_err());
        assert_eq!(state.outstanding(), 0);
        assert_eq!(state.common.acknowledged_in_window, 2);
    }
}
