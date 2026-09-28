//! Benchmark-only native clients for the presentation's bounded remote workload.

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{SinkExt as _, StreamExt as _};
use sea_benchmarks::measurement::MeasurementClock;
use sea_core::{
    Event, EventSubmission, MonitoredStreamItem, MonitoredStreamStatus, SeaAuthorSession,
    archive::SessionEventKind, storage::LoadStart,
};
use sea_webtransport::{
    NativeSeaClient, SeaClientError, SessionClient, SessionOpen, TransportConfig, protocol,
    transport::{BidirectionalStream, ClientTransport},
    websocket::{self, CHUNK_BYTES, DATA, FIN, MAX_RECORD_BYTES, RECORD_HEADER_BYTES, SUBPROTOCOL},
};
use serde::Deserialize;
use serde_json::json;
use std::{
    io::{BufRead as _, Write as _},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use tokio::net::TcpStream;
use tokio_tungstenite::{
    MaybeTlsStream, WebSocketStream, connect_async_with_config,
    tungstenite::{Message, client::IntoClientRequest as _, protocol::WebSocketConfig},
};

#[path = "presentation-native/streamed.rs"]
mod streamed;

/// Socket type used only against the local, unencrypted benchmark listener.
type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

/// Converts adapter failures into the existing session error contract.
fn socket_error(error: impl std::fmt::Display) -> SeaClientError {
    sea_webtransport::WebTransportError::Transport(error.to_string()).into()
}

/// Opens a bounded socket with the same subprotocol and `TCP_NODELAY` as the server.
async fn socket(url: &str) -> Result<Socket, SeaClientError> {
    let mut request = url.into_client_request().map_err(socket_error)?;
    request.headers_mut().insert(
        "Sec-WebSocket-Protocol",
        SUBPROTOCOL.parse().map_err(socket_error)?,
    );
    let config = WebSocketConfig::default()
        .max_message_size(Some(MAX_RECORD_BYTES))
        .max_frame_size(Some(MAX_RECORD_BYTES))
        .write_buffer_size(0);
    let (socket, response) = connect_async_with_config(request, Some(config), true)
        .await
        .map_err(socket_error)?;
    if response
        .headers()
        .get("Sec-WebSocket-Protocol")
        .and_then(|value| value.to_str().ok())
        != Some(SUBPROTOCOL)
    {
        return Err(socket_error("missing Sea subprotocol"));
    }
    Ok(socket)
}

/// Retains the control socket for the lifetime of one logical session.
struct SocketTransport {
    /// Control connection ownership; the server does not send periodic messages.
    _control: Socket,
    /// Token-bearing endpoint used for each independent byte stream.
    child_url: String,
    /// Prevents new streams after session closure.
    closed: AtomicBool,
}

impl SocketTransport {
    /// Performs the Sea control handshake before opening child streams.
    async fn connect(url: &str) -> Result<Self, SeaClientError> {
        let mut control = socket(url).await?;
        let Some(Ok(Message::Text(token))) = control.next().await else {
            return Err(socket_error("missing control token"));
        };
        if token.len() != 64 || !token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(socket_error("invalid control token"));
        }
        Ok(Self {
            _control: control,
            child_url: format!("{url}/{token}"),
            closed: AtomicBool::new(false),
        })
    }
}

/// One independently backpressured Sea stream, without an application receive queue.
struct SocketStream(Socket);

#[async_trait]
impl BidirectionalStream for SocketStream {
    type Error = SeaClientError;

    async fn send(&mut self, bytes: &[u8]) -> Result<(), Self::Error> {
        for chunk in bytes.chunks(CHUNK_BYTES) {
            let mut record = Vec::with_capacity(chunk.len() + RECORD_HEADER_BYTES);
            record.push(DATA);
            record.extend_from_slice(chunk);
            self.0
                .send(Message::Binary(record.into()))
                .await
                .map_err(socket_error)?;
        }
        Ok(())
    }

    async fn finish(&mut self) -> Result<(), Self::Error> {
        self.0
            .send(Message::Binary(vec![FIN].into()))
            .await
            .map_err(socket_error)
    }

    async fn receive(&mut self) -> Result<Option<Vec<u8>>, Self::Error> {
        loop {
            match self.0.next().await {
                Some(Ok(Message::Binary(bytes))) => {
                    return match websocket::decode(&bytes) {
                        Some(websocket::Record::Data(data)) => Ok(Some(data.to_vec())),
                        Some(websocket::Record::Finish) => Ok(None),
                        None => Err(socket_error("invalid stream record")),
                    };
                }
                Some(Ok(Message::Ping(_) | Message::Pong(_))) => {}
                message => {
                    return Err(socket_error(format!(
                        "unexpected socket message: {message:?}"
                    )));
                }
            }
        }
    }

    async fn cancel(&mut self) -> Result<(), Self::Error> {
        self.0.close(None).await.map_err(socket_error)
    }
}

#[async_trait]
impl ClientTransport for SocketTransport {
    type Stream = SocketStream;
    type Error = SeaClientError;

    async fn open_bidirectional(&self) -> Result<Self::Stream, Self::Error> {
        if self.closed.load(Ordering::Relaxed) {
            return Err(socket_error("closed transport"));
        }
        Ok(SocketStream(socket(&self.child_url).await?))
    }

    fn disconnect(&self) -> Result<(), Self::Error> {
        self.closed.store(true, Ordering::Relaxed);
        Ok(())
    }
}

/// Source of work for each ordered document writer.
#[derive(Clone, Copy, Default, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
enum LoadMode {
    /// Issue operations according to the configured rate.
    #[default]
    Paced,
    /// Submit the next operation only after the preceding acknowledgment.
    ClosedLoop,
    /// Pipeline WebTransport frames, awaiting transport capacity rather than acknowledgments.
    Streamed,
}

/// Parent-provided workload for one single-core generator process.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Configuration {
    /// Remote listener URL.
    endpoint: String,
    /// WebSocket or WebTransport, with the same typed session API.
    transport: String,
    /// Pinned server certificate in WebTransport's textual digest format.
    certificate_hash: String,
    /// Number of writer/observer pairs owned by this process.
    documents: usize,
    /// Total operations per second for this process in paced mode.
    #[serde(default)]
    rate: u32,
    /// Closed-loop mode has no offered-rate target.
    #[serde(default)]
    load_mode: LoadMode,
    /// Application bytes per operation.
    payload_bytes: usize,
    /// Measured duration after warmup.
    seconds: u64,
    /// Unmeasured initial duration at the same load.
    warmup_seconds: u64,
    /// Optional bounded drain override for streamed measurements.
    #[serde(default)]
    drain_timeout_seconds: Option<u64>,
}

/// Per-document timing and correctness state shared by submission and delivery tasks.
#[derive(Default)]
struct State {
    /// Admission timestamp and measured-window membership, indexed by operation sequence.
    times: Vec<(Instant, bool)>,
    /// Ordered application deliveries to writer and observer.
    observed: [usize; 2],
    /// Validated deliveries per recipient in the half-open measured time window.
    observed_in_window: [usize; 2],
    /// Successful service acknowledgments.
    acknowledged: usize,
    /// Successful acknowledgments in the half-open measured time window.
    acknowledged_in_window: usize,
    /// All acknowledgment timestamps for aligned CPU accounting in closed-loop mode.
    acknowledgment_epoch_micros: Vec<u64>,
    /// Submit-to-acknowledgment latency for completions in the measured window.
    acknowledgment_latencies: Vec<f64>,
    /// Explicit service revocation, distinct from corruption or transport loss.
    shed: [bool; 2],
    /// Measured observer deliveries before the window closes.
    delivered: usize,
    /// Submit-to-observe times, including measured submissions drained afterward.
    latencies: Vec<f64>,
    /// All application observer deliveries, including warmup and drain.
    observer_delivery_epoch_micros: Vec<u64>,
    /// First correctness or transport failure.
    error: Option<String>,
}

impl State {
    /// Accounts for completions by acknowledgment time, including warmup submissions.
    fn acknowledge(
        &mut self,
        sent_at: Instant,
        now: Instant,
        warm_end: Instant,
        end: Instant,
        clock: MeasurementClock,
    ) {
        self.acknowledged += 1;
        self.acknowledgment_epoch_micros.push(clock.at(now));
        if now >= warm_end && now < end {
            self.acknowledged_in_window += 1;
            self.acknowledgment_latencies
                .push(now.duration_since(sent_at).as_secs_f64() * 1000.0);
        }
    }

    /// A shed reader need not catch up, but all other deliveries and acknowledgments must drain.
    fn drained(&self) -> bool {
        self.acknowledged == self.times.len()
            && (0..2).all(|recipient| {
                self.shed[recipient] || self.observed[recipient] == self.times.len()
            })
    }

    /// Validates one delivery before advancing its recipient or recording observer timing.
    /// Warmup contributes timestamps, while measured deliveries contribute latency even during drain.
    fn observe(
        &mut self,
        recipient: usize,
        received: &Bytes,
        payload_bytes: usize,
        now: Instant,
        window: std::ops::Range<Instant>,
        clock: MeasurementClock,
    ) -> Result<(), String> {
        let sequence = self.observed[recipient] + 1;
        if received != &payload(sequence, payload_bytes) || sequence > self.times.len() {
            return Err("duplicate, missing, reordered, or corrupt payload".into());
        }
        self.observed[recipient] = sequence;
        self.observed_in_window[recipient] += usize::from(window.contains(&now));
        let (sent_at, measured) = self.times[sequence - 1];
        if recipient == 1 {
            self.observer_delivery_epoch_micros.push(clock.at(now));
            if measured {
                self.latencies
                    .push(now.duration_since(sent_at).as_secs_f64() * 1000.0);
                self.delivered += usize::from(now < window.end);
            }
        }
        Ok(())
    }
}

/// The protocol currently preserves the subscription-only outcome as a classified diagnostic.
fn subscription_was_shed(error: &SeaClientError) -> bool {
    matches!(error, SeaClientError::Service(protocol::ErrorKind::Rejected, message)
        if matches!(message.as_str(), "live subscription revoked" | "source: live subscription revoked"))
}

/// Creates the exact deterministic payload used by the Node generator.
fn payload(sequence: usize, bytes: usize) -> Bytes {
    let mut result = format!("{sequence:08}").into_bytes();
    result.resize(bytes, b'x');
    Bytes::from(result)
}

/// Selects creation or opening of an archive before service identity allocation.
fn session_open(archive: Bytes, create: bool) -> SessionOpen {
    SessionOpen {
        archive,
        intent: if create {
            protocol::ArchiveIntent::Create
        } else {
            protocol::ArchiveIntent::Open
        },
        reference: None,
    }
}

/// Executes the selected workload and observation logic for either native transport.
#[allow(
    clippy::too_many_lines,
    reason = "Keeps bounded pacing, task ownership, and draining in one benchmark lifecycle"
)]
async fn measure<Session>(
    configuration: &Configuration,
    pairs: Vec<(Session, Session)>,
) -> Result<serde_json::Value, Box<dyn std::error::Error>>
where
    Session: SeaAuthorSession<Error = SeaClientError> + 'static,
{
    let clock = MeasurementClock::new();
    let states: Vec<_> = pairs
        .iter()
        .map(|_| Arc::new(Mutex::new(State::default())))
        .collect();
    let mut senders = Vec::new();
    let mut tasks = Vec::new();
    let closed_loop = configuration.load_mode == LoadMode::ClosedLoop;
    let (start, start_signal) = tokio::sync::watch::channel(None::<(Instant, Instant)>);
    let (reader_ready, mut readiness) = tokio::sync::mpsc::channel(2 * pairs.len());
    let measurement_window = Arc::new(Mutex::new(None::<std::ops::Range<Instant>>));
    for ((writer, observer), state) in pairs.into_iter().zip(&states) {
        let writer = Arc::new(writer);
        let observer = Arc::new(observer);
        for (recipient, session) in [Arc::clone(&writer), observer].into_iter().enumerate() {
            let state = Arc::clone(state);
            let measurement_window = Arc::clone(&measurement_window);
            let bytes = configuration.payload_bytes;
            let mut ready = Some(reader_ready.clone());
            tasks.push(tokio::spawn(async move {
                // Consume the connection's opening recovery/live stream instead of abandoning it.
                let mut events = match session.load(LoadStart::LatestSnapshot).await {
                    Ok(load) => load.events,
                    Err(error) => {
                        state.lock().expect("state lock").error = Some(error.to_string());
                        return;
                    }
                };
                while let Some(event) = events.next().await {
                    let mut state = state.lock().expect("state lock");
                    match event {
                        Ok(MonitoredStreamItem::Item(event))
                            if event.kind == SessionEventKind::Application =>
                        {
                            let result = state.observe(
                                recipient,
                                &event.committed.event.payload,
                                bytes,
                                Instant::now(),
                                measurement_window
                                    .lock()
                                    .expect("window lock")
                                    .clone()
                                    .expect("started"),
                                clock,
                            );
                            if let Err(error) = result {
                                state.error = Some(error);
                                return;
                            }
                        }
                        Ok(MonitoredStreamItem::Progress(progress))
                            if progress.status == MonitoredStreamStatus::AwaitingNewItems =>
                        {
                            if let Some(ready) = ready.take() {
                                ready
                                    .try_send(())
                                    .expect("one readiness message per reader");
                            }
                        }
                        Ok(_) => {}
                        Err(error) if closed_loop && subscription_was_shed(&error) => {
                            state.shed[recipient] = true;
                            return;
                        }
                        Err(error) => {
                            state.error = Some(error.to_string());
                            return;
                        }
                    }
                }
                state.lock().expect("state lock").error =
                    Some("reader ended without explicit subscription shedding".to_owned());
            }));
        }
        let (sender, mut receiver) =
            tokio::sync::mpsc::channel::<usize>(if closed_loop { 1 } else { 8192 });
        senders.push(sender);
        let state = Arc::clone(state);
        let bytes = configuration.payload_bytes;
        let mut start_signal = start_signal.clone();
        let operation_limit = 1_000_000 / configuration.documents;
        tasks.push(tokio::spawn(async move {
            let window = if closed_loop {
                *start_signal
                    .wait_for(Option::is_some)
                    .await
                    .expect("workload start signal")
            } else {
                None
            };
            loop {
                let sequence = if let Some((warm_end, end)) = window {
                    let now = Instant::now();
                    if now >= end {
                        break;
                    }
                    let mut state = state.lock().expect("state lock");
                    if state.times.len() >= operation_limit {
                        state.error = Some("bounded timing-record limit reached".to_owned());
                    }
                    if state.error.is_some() {
                        break;
                    }
                    state.times.push((now, now >= warm_end));
                    state.times.len()
                } else if let Some(sequence) = receiver.recv().await {
                    sequence
                } else {
                    break;
                };
                let submission = EventSubmission {
                    reference: None,
                    event: Event {
                        payload: payload(sequence, bytes),
                        blob_tree: None,
                    },
                };
                let result = writer.submit(submission).await;
                let mut state = state.lock().expect("state lock");
                match result {
                    Ok(_) if closed_loop => {
                        let (warm_end, end) = window.expect("closed-loop window");
                        let sent_at = state.times[sequence - 1].0;
                        state.acknowledge(sent_at, Instant::now(), warm_end, end, clock);
                    }
                    Ok(_) => state.acknowledged += 1,
                    Err(error) => {
                        state.error = Some(error.to_string());
                        break;
                    }
                }
            }
        }));
    }
    drop(reader_ready);
    if closed_loop {
        tokio::time::timeout(Duration::from_secs(30), async {
            for _ in 0..2 * states.len() {
                readiness
                    .recv()
                    .await
                    .ok_or("reader failed before live readiness")?;
            }
            Ok::<_, &str>(())
        })
        .await??;
    }
    println!("{}", json!({"type":"ready"}));
    std::io::stdout().flush()?;
    let mut line = String::new();
    std::io::stdin().lock().read_line(&mut line)?;
    if line.trim().is_empty() {
        return Err("missing start signal".into());
    }
    let started = Instant::now();
    let warm_end = started + Duration::from_secs(configuration.warmup_seconds);
    let end = warm_end + Duration::from_secs(configuration.seconds);
    *measurement_window.lock().expect("window lock") = Some(warm_end..end);
    if closed_loop {
        start.send_replace(Some((warm_end, end)));
    }
    let mut sent = 0_usize;
    let mut max_pending = 0;
    let mut max_lag = 0_f64;
    let mut max_in_flight = 0;
    let mut backlog = Vec::new();
    let mut last_sample = started;
    let mut errors = Vec::new();
    while Instant::now() < end {
        let now = Instant::now();
        let target = if closed_loop {
            sent = states
                .iter()
                .map(|state| state.lock().expect("state lock").times.len())
                .sum();
            sent
        } else {
            let target = usize::try_from(
                now.duration_since(started).as_nanos() * u128::from(configuration.rate)
                    / 1_000_000_000,
            )?;
            max_lag = max_lag.max(
                f64::from(u32::try_from(target.saturating_sub(sent))?)
                    / f64::from(configuration.rate)
                    * 1000.0,
            );
            target
        };
        let pending: usize = states
            .iter()
            .map(|state| {
                let state = state.lock().expect("state lock");
                state.times.len() - state.observed[1]
            })
            .sum();
        max_pending = max_pending.max(pending);
        let in_flight: usize = states
            .iter()
            .map(|state| {
                let state = state.lock().expect("state lock");
                state.times.len() - state.acknowledged
            })
            .sum();
        max_in_flight = max_in_flight.max(in_flight);
        if !closed_loop && (pending > 8192 || sent >= 1_000_000) {
            errors.push("bounded backlog or operation limit reached".to_owned());
            break;
        }
        if states
            .iter()
            .any(|state| state.lock().expect("state lock").error.is_some())
        {
            break;
        }
        for _ in 0..target.saturating_sub(sent).min(512) {
            let index = sent % states.len();
            let sequence = {
                let mut state = states[index].lock().expect("state lock");
                let timestamp = Instant::now();
                state.times.push((timestamp, timestamp >= warm_end));
                state.times.len()
            };
            senders[index].try_send(sequence)?;
            sent += 1;
        }
        if now.duration_since(last_sample) >= Duration::from_millis(250) {
            backlog.push(json!({"seconds":now.duration_since(started).as_secs_f64(),"pending":pending,"sent":sent}));
            last_sample = now;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    let pending_at_end: usize = states
        .iter()
        .map(|state| {
            let state = state.lock().expect("state lock");
            state.times.len() - state.observed[1]
        })
        .sum();
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline && errors.is_empty() {
        if states
            .iter()
            .any(|state| state.lock().expect("state lock").error.is_some())
        {
            break;
        }
        if states.iter().all(|state| {
            let state = state.lock().expect("state lock");
            state.drained()
        }) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    let mut latencies = Vec::new();
    let mut measured_sent = 0;
    let mut delivered = 0;
    let mut missing = 0;
    let mut acknowledged = 0;
    let mut acknowledged_in_window = 0;
    let mut acknowledgment_epoch_micros = Vec::new();
    let mut acknowledgment_latencies = Vec::new();
    let mut reader_outcomes = Vec::new();
    let mut shed_missing = 0;
    let mut observer_delivery_epoch_micros = Vec::new();
    if closed_loop {
        sent = states
            .iter()
            .map(|state| state.lock().expect("state lock").times.len())
            .sum();
    }
    for (document, state) in states.iter().enumerate() {
        let mut state = state.lock().expect("state lock");
        measured_sent += state.times.iter().filter(|(_, measured)| *measured).count();
        delivered += state.delivered;
        missing += 2 * state.times.len() - state.observed.iter().sum::<usize>();
        acknowledged += state.acknowledged;
        acknowledged_in_window += state.acknowledged_in_window;
        acknowledgment_epoch_micros.append(&mut state.acknowledgment_epoch_micros);
        acknowledgment_latencies.append(&mut state.acknowledgment_latencies);
        for recipient in 0..2 {
            let undelivered = state.times.len() - state.observed[recipient];
            if state.shed[recipient] {
                shed_missing += undelivered;
            }
            reader_outcomes.push(json!({
                "document": document, "recipient": recipient, "shed": state.shed[recipient],
                "delivered": state.observed[recipient], "undelivered": undelivered,
                "receivedInWindow": state.observed_in_window[recipient],
            }));
        }
        observer_delivery_epoch_micros.append(&mut state.observer_delivery_epoch_micros);
        latencies.append(&mut state.latencies);
        if let Some(error) = state.error.take() {
            errors.push(error);
        }
    }
    latencies.sort_by(f64::total_cmp);
    let percentile = |percent: usize| {
        latencies
            .get((latencies.len() * percent).div_ceil(100).saturating_sub(1))
            .copied()
    };
    acknowledgment_latencies.sort_by(f64::total_cmp);
    let acknowledgment_percentile = |percent: usize| {
        acknowledgment_latencies
            .get(
                (acknowledgment_latencies.len() * percent)
                    .div_ceil(100)
                    .saturating_sub(1),
            )
            .copied()
    };
    for task in tasks {
        task.abort();
    }
    Ok(
        json!({"type":"result", "sent":sent,"measuredSent":measured_sent,"deliveredInWindow":delivered,"missing":missing,"errors":errors,"pendingAtEnd":pending_at_end,"maxPending":max_pending,"maxScheduleLagMilliseconds":max_lag,"latencyMilliseconds":{"median":percentile(50),"p95":percentile(95),"max":latencies.last()},"acknowledged":acknowledged,"backlog":backlog,"observerDeliveryEpochMicros":observer_delivery_epoch_micros,"measurementClock":clock.report(),
        "acknowledgedInWindow":acknowledged_in_window,"acknowledgmentEpochMicros":acknowledgment_epoch_micros,
        "acknowledgmentLatencyMilliseconds":{"median":acknowledgment_percentile(50),"p95":acknowledgment_percentile(95),"max":acknowledgment_latencies.last()},
        "maxInFlight":max_in_flight,"documentCount":states.len(),"readerOutcomes":reader_outcomes,"shedMissing":shed_missing}),
    )
}

/// Opens native session pairs; each process uses a single Tokio execution thread.
#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let configuration: Configuration =
        serde_json::from_str(&std::env::args().nth(1).ok_or("missing configuration")?)?;
    if configuration.documents == 0
        || configuration.documents > 32
        || !(8..=8192).contains(&configuration.payload_bytes)
        || (configuration.load_mode == LoadMode::Paced && configuration.rate == 0)
        || configuration.seconds == 0
    {
        return Err("invalid workload".into());
    }
    let result = if configuration.load_mode == LoadMode::Streamed {
        if configuration.transport != "webtransport" {
            return Err("streamed mode requires WebTransport".into());
        }
        streamed::measure(&configuration).await?
    } else if configuration.transport == "webtransport" {
        let mut pairs = Vec::new();
        for _ in 0..configuration.documents {
            let writer = NativeSeaClient::connect(
                &configuration.endpoint,
                configuration.certificate_hash.parse()?,
                TransportConfig::default(),
                session_open(Bytes::new(), true),
            )
            .await?;
            let observer = NativeSeaClient::connect(
                &configuration.endpoint,
                configuration.certificate_hash.parse()?,
                TransportConfig::default(),
                session_open(Bytes::copy_from_slice(writer.document().as_bytes()), false),
            )
            .await?;
            pairs.push((writer, observer));
        }
        measure(&configuration, pairs).await?
    } else if configuration.transport == "websocket" {
        let mut pairs = Vec::new();
        for _ in 0..configuration.documents {
            let writer = SessionClient::open(
                SocketTransport::connect(&configuration.endpoint).await?,
                protocol::Limits::default(),
                session_open(Bytes::new(), true),
            )
            .await?;
            let observer = SessionClient::open(
                SocketTransport::connect(&configuration.endpoint).await?,
                protocol::Limits::default(),
                session_open(Bytes::copy_from_slice(writer.document().as_bytes()), false),
            )
            .await?;
            pairs.push((writer, observer));
        }
        measure(&configuration, pairs).await?
    } else {
        return Err("unknown transport".into());
    };
    println!("{result}");
    std::io::stdout().flush()?;
    let mut line = String::new();
    std::io::stdin().lock().read_line(&mut line)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acknowledgments_use_completion_window_not_submission_window() {
        let clock = MeasurementClock::new();
        let start = Instant::now();
        let warm_end = start + Duration::from_secs(1);
        let end = start + Duration::from_secs(2);
        let mut state = State::default();
        for now in [
            start,
            warm_end,
            end.checked_sub(Duration::from_nanos(1)).unwrap(),
            end,
        ] {
            state.acknowledge(start, now, warm_end, end, clock);
        }
        assert_eq!(state.acknowledged, 4);
        assert_eq!(state.acknowledged_in_window, 2);
        assert_eq!(state.acknowledgment_epoch_micros.len(), 4);
        assert_eq!(state.acknowledgment_latencies.len(), 2);
    }

    #[test]
    fn shedding_does_not_hide_other_errors_or_missing_acknowledgments() {
        for message in [
            "live subscription revoked",
            "source: live subscription revoked",
        ] {
            assert!(subscription_was_shed(&SeaClientError::Service(
                protocol::ErrorKind::Rejected,
                message.to_owned(),
            )));
        }
        assert!(!subscription_was_shed(&SeaClientError::Closed));
        assert!(!subscription_was_shed(&SeaClientError::Service(
            protocol::ErrorKind::Rejected,
            "session is closed".to_owned(),
        )));
        assert!(!subscription_was_shed(&SeaClientError::Service(
            protocol::ErrorKind::Ambiguous,
            "live subscription revoked".to_owned(),
        )));
        let mut state = State {
            times: vec![(Instant::now(), true)],
            acknowledged: 1,
            observed: [1, 0],
            ..State::default()
        };
        assert!(!state.drained());
        state.shed[1] = true;
        assert!(state.drained());
        state.acknowledged = 0;
        assert!(!state.drained());
    }

    #[test]
    fn closed_loop_configuration_does_not_require_a_rate() {
        let mut value = json!({
            "endpoint":"test", "transport":"websocket", "certificateHash":"",
            "documents":1, "payloadBytes":64, "seconds":1, "warmupSeconds":1,
            "loadMode":"closed-loop",
        });
        let config: Configuration = serde_json::from_value(value.clone()).unwrap();
        assert!(config.load_mode == LoadMode::ClosedLoop);
        assert_eq!(config.rate, 0);
        value.as_object_mut().unwrap().remove("loadMode");
        let config: Configuration = serde_json::from_value(value).unwrap();
        assert!(config.load_mode == LoadMode::Paced);
    }

    #[tokio::test]
    #[allow(
        clippy::result_large_err,
        reason = "The handshake callback uses tungstenite's fixed response error type"
    )]
    async fn socket_stream_chunks_data_and_requires_explicit_fin() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_hdr_async(
                stream,
                |_: &tokio_tungstenite::tungstenite::handshake::server::Request,
                 mut response: tokio_tungstenite::tungstenite::handshake::server::Response| {
                    response.headers_mut().insert(
                        "Sec-WebSocket-Protocol",
                        SUBPROTOCOL.parse().unwrap(),
                    );
                    Ok(response)
                },
            )
            .await
            .unwrap();
            for size in [CHUNK_BYTES, 1] {
                let Message::Binary(record) = socket.next().await.unwrap().unwrap() else {
                    panic!("expected binary data");
                };
                assert_eq!(record[0], DATA);
                assert_eq!(record.len(), size + RECORD_HEADER_BYTES);
                assert!(record[RECORD_HEADER_BYTES..].iter().all(|byte| *byte == 42));
            }
            assert_eq!(
                socket.next().await.unwrap().unwrap(),
                Message::Binary(vec![FIN].into())
            );
            socket
                .send(Message::Binary(vec![DATA, 7, 8].into()))
                .await
                .unwrap();
            socket
                .send(Message::Binary(vec![FIN].into()))
                .await
                .unwrap();
        });
        tokio::time::timeout(Duration::from_secs(3), async {
            let mut stream = SocketStream(socket(&format!("ws://{address}")).await.unwrap());
            stream.send(&vec![42; CHUNK_BYTES + 1]).await.unwrap();
            stream.finish().await.unwrap();
            assert_eq!(stream.receive().await.unwrap(), Some(vec![7, 8]));
            assert_eq!(stream.receive().await.unwrap(), None);
            server.await.unwrap();
        })
        .await
        .expect("bounded socket fixture");
    }

    #[tokio::test]
    async fn socket_rejects_missing_subprotocol() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            tokio_tungstenite::accept_async(stream).await.unwrap()
        });
        tokio::time::timeout(Duration::from_secs(3), async {
            assert!(socket(&format!("ws://{address}")).await.is_err());
            drop(server.await.unwrap());
        })
        .await
        .expect("bounded subprotocol fixture");
    }

    #[test]
    fn payload_matches_node_fixture() {
        assert_eq!(payload(42, 12), Bytes::from_static(b"00000042xxxx"));
        assert_eq!(payload(1, 8192).len(), 8192);
    }

    #[test]
    fn observation_rejects_wrong_order_corruption_and_unsubmitted_deliveries() {
        let clock = MeasurementClock::new();
        let now = Instant::now();
        let mut state = State {
            times: vec![(now, true)],
            ..State::default()
        };
        for received in [payload(2, 12), Bytes::from_static(b"00000001bad!")] {
            assert!(
                state
                    .observe(1, &received, 12, now, now..now, clock)
                    .is_err()
            );
            assert_eq!(state.observed, [0, 0]);
            assert_eq!(state.observed_in_window, [0, 0]);
            assert!(state.observer_delivery_epoch_micros.is_empty());
        }
        state
            .observe(1, &payload(1, 12), 12, now, now..now, clock)
            .unwrap();
        for received in [payload(1, 12), payload(2, 12)] {
            assert!(
                state
                    .observe(1, &received, 12, now, now..now, clock)
                    .is_err()
            );
            assert_eq!(state.observed, [0, 1]);
        }
    }

    #[test]
    fn observation_separates_writer_warmup_window_and_drain() {
        let clock = MeasurementClock::new();
        let started = Instant::now();
        let warm_end = started + Duration::from_millis(2);
        let end = started + Duration::from_millis(10);
        let mut state = State {
            times: vec![
                (started, false),
                (started, false),
                (started, true),
                (started, true),
            ],
            ..State::default()
        };
        for recipient in [0, 1] {
            for (sequence, now) in [
                (1, started + Duration::from_millis(1)),
                (2, warm_end),
                (3, started + Duration::from_millis(5)),
                (4, end),
            ] {
                state
                    .observe(
                        recipient,
                        &payload(sequence, 12),
                        12,
                        now,
                        warm_end..end,
                        clock,
                    )
                    .unwrap();
            }
            if recipient == 0 {
                assert!(state.latencies.is_empty());
                assert!(state.observer_delivery_epoch_micros.is_empty());
                assert_eq!(state.delivered, 0);
            }
        }
        assert_eq!(state.observed, [4, 4]);
        assert_eq!(state.observed_in_window, [2, 2]);
        assert_eq!(state.delivered, 1);
        assert_eq!(state.latencies, vec![5.0, 10.0]);
        assert_eq!(
            state.observer_delivery_epoch_micros,
            vec![
                clock.at(started + Duration::from_millis(1)),
                clock.at(warm_end),
                clock.at(started + Duration::from_millis(5)),
                clock.at(end),
            ]
        );
    }
}
