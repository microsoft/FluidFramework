//! Benchmark-only native clients for the presentation's bounded remote workload.

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{SinkExt as _, StreamExt as _};
use sea_core::{
    Event, EventSubmission, MonitoredStreamItem, SeaAuthorSession, SessionId,
    archive::SessionEventKind,
};
use sea_webtransport::{
    NativeSeaClient, SeaClientError, SessionClient, SessionOpen, TransportConfig, protocol,
    transport::{BidirectionalStream, ClientTransport},
    websocket::{self, CHUNK_BYTES, DATA, FIN, SUBPROTOCOL},
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
        .max_message_size(Some(CHUNK_BYTES + 1))
        .max_frame_size(Some(CHUNK_BYTES + 1))
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
            let mut record = Vec::with_capacity(chunk.len() + 1);
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
    /// Total operations per second for this process.
    rate: u32,
    /// Application bytes per operation.
    payload_bytes: usize,
    /// Measured duration after warmup.
    seconds: u64,
    /// Unmeasured initial duration at the same load.
    warmup_seconds: u64,
}

/// Per-document timing and correctness state shared by submission and delivery tasks.
#[derive(Default)]
struct State {
    /// Admission timestamp and measured-window membership, indexed by operation sequence.
    times: Vec<(Instant, bool)>,
    /// Ordered application deliveries to writer and observer.
    observed: [usize; 2],
    /// Successful service acknowledgments.
    acknowledged: usize,
    /// Measured observer deliveries before the window closes.
    delivered: usize,
    /// Submit-to-observe times, including measured submissions drained afterward.
    latencies: Vec<f64>,
    /// First correctness or transport failure.
    error: Option<String>,
}

/// Creates the exact deterministic payload used by the Node generator.
fn payload(sequence: usize, bytes: usize) -> Bytes {
    let mut result = format!("{sequence:08}").into_bytes();
    result.resize(bytes, b'x');
    Bytes::from(result)
}

/// Generates session identities unique within a fresh service and worker process.
fn session_open(archive: Bytes, create: bool, index: usize) -> SessionOpen {
    let identity = Bytes::from(format!("{}-{index}", std::process::id()));
    SessionOpen {
        archive,
        intent: if create {
            protocol::ArchiveIntent::Create
        } else {
            protocol::ArchiveIntent::Open
        },

        session: SessionId::new(identity).expect("nonempty identity"),
        reference: None,
    }
}

/// Executes identical pacing and observation logic for either native transport.
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
    let states: Vec<_> = pairs
        .iter()
        .map(|_| Arc::new(Mutex::new(State::default())))
        .collect();
    let mut senders = Vec::new();
    let mut tasks = Vec::new();
    let end_time = Arc::new(Mutex::new(None::<Instant>));
    for ((writer, observer), state) in pairs.into_iter().zip(&states) {
        let writer = Arc::new(writer);
        let observer = Arc::new(observer);
        for (recipient, session) in [Arc::clone(&writer), observer].into_iter().enumerate() {
            let state = Arc::clone(state);
            let end_time = Arc::clone(&end_time);
            let bytes = configuration.payload_bytes;
            tasks.push(tokio::spawn(async move {
                let mut events = session.read(None, None);
                while let Some(event) = events.next().await {
                    let mut state = state.lock().expect("state lock");
                    match event {
                        Ok(MonitoredStreamItem::Item(event))
                            if event.kind == SessionEventKind::Application =>
                        {
                            let sequence = state.observed[recipient] + 1;
                            if event.committed.event.payload != payload(sequence, bytes)
                                || sequence > state.times.len()
                            {
                                state.error = Some(
                                    "duplicate, missing, reordered, or corrupt payload".into(),
                                );
                                break;
                            }
                            state.observed[recipient] = sequence;
                            let (sent_at, measured) = state.times[sequence - 1];
                            if recipient == 1 && measured {
                                let now = Instant::now();
                                state
                                    .latencies
                                    .push(now.duration_since(sent_at).as_secs_f64() * 1000.0);
                                if now < end_time.lock().expect("end lock").expect("started") {
                                    state.delivered += 1;
                                }
                            }
                        }
                        Ok(_) => {}
                        Err(error) => {
                            state.error = Some(error.to_string());
                            break;
                        }
                    }
                }
            }));
        }
        let (sender, mut receiver) = tokio::sync::mpsc::channel::<usize>(8192);
        senders.push(sender);
        let state = Arc::clone(state);
        let bytes = configuration.payload_bytes;
        tasks.push(tokio::spawn(async move {
            while let Some(sequence) = receiver.recv().await {
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
                    Ok(_) => state.acknowledged += 1,
                    Err(error) => {
                        state.error = Some(error.to_string());
                        break;
                    }
                }
            }
        }));
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
    *end_time.lock().expect("end lock") = Some(end);
    let mut sent = 0_usize;
    let mut max_pending = 0;
    let mut max_lag = 0_f64;
    let mut backlog = Vec::new();
    let mut last_sample = started;
    let mut errors = Vec::new();
    while Instant::now() < end {
        let now = Instant::now();
        let target = usize::try_from(
            now.duration_since(started).as_nanos() * u128::from(configuration.rate) / 1_000_000_000,
        )?;
        max_lag = max_lag.max(
            f64::from(u32::try_from(target.saturating_sub(sent))?) / f64::from(configuration.rate)
                * 1000.0,
        );
        let pending: usize = states
            .iter()
            .map(|state| {
                let state = state.lock().expect("state lock");
                state.times.len() - state.observed[1]
            })
            .sum();
        max_pending = max_pending.max(pending);
        if pending > 8192 || sent >= 1_000_000 {
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
            state.observed == [state.times.len(); 2] && state.acknowledged == state.times.len()
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
    for state in &states {
        let mut state = state.lock().expect("state lock");
        measured_sent += state.times.iter().filter(|(_, measured)| *measured).count();
        delivered += state.delivered;
        missing += 2 * state.times.len() - state.observed.iter().sum::<usize>();
        acknowledged += state.acknowledged;
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
    for task in tasks {
        task.abort();
    }
    Ok(
        json!({"type":"result", "sent":sent,"measuredSent":measured_sent,"deliveredInWindow":delivered,"missing":missing,"errors":errors,"pendingAtEnd":pending_at_end,"maxPending":max_pending,"maxScheduleLagMilliseconds":max_lag,"latencyMilliseconds":{"median":percentile(50),"p95":percentile(95),"max":latencies.last()},"acknowledged":acknowledged,"backlog":backlog}),
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
        || configuration.rate == 0
        || configuration.seconds == 0
    {
        return Err("invalid workload".into());
    }
    let result = if configuration.transport == "webtransport" {
        let mut pairs = Vec::new();
        for index in 0..configuration.documents {
            let writer = NativeSeaClient::connect(
                &configuration.endpoint,
                configuration.certificate_hash.parse()?,
                TransportConfig::default(),
                session_open(Bytes::new(), true, index * 2),
            )
            .await?;
            let observer = NativeSeaClient::connect(
                &configuration.endpoint,
                configuration.certificate_hash.parse()?,
                TransportConfig::default(),
                session_open(
                    Bytes::copy_from_slice(writer.document().as_bytes()),
                    false,
                    index * 2 + 1,
                ),
            )
            .await?;
            pairs.push((writer, observer));
        }
        measure(&configuration, pairs).await?
    } else if configuration.transport == "websocket" {
        let mut pairs = Vec::new();
        for index in 0..configuration.documents {
            let writer = SessionClient::open(
                SocketTransport::connect(&configuration.endpoint).await?,
                protocol::Limits::default(),
                session_open(Bytes::new(), true, index * 2),
            )
            .await?;
            let observer = SessionClient::open(
                SocketTransport::connect(&configuration.endpoint).await?,
                protocol::Limits::default(),
                session_open(
                    Bytes::copy_from_slice(writer.document().as_bytes()),
                    false,
                    index * 2 + 1,
                ),
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
    fn payload_matches_node_fixture() {
        assert_eq!(payload(42, 12), Bytes::from_static(b"00000042xxxx"));
        assert_eq!(payload(1, 8192).len(), 8192);
    }
}
