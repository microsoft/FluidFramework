//! Process-isolated transport over a versioned Unix-domain socket protocol.

use std::{
    io,
    path::{Path, PathBuf},
    process::{Child, Command},
    sync::{
        Arc,
        atomic::{AtomicU64, AtomicUsize, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::StreamExt;
use snapshotted_stream_core::{
    AppendReceipt, AppendStream, Capabilities, Capability, ClassifiedError, Durability, ErrorKind,
    PositionCodec, PublishedSnapshot, ReadRecord, Snapshot, SnapshotId, SnapshotPosition,
    SnapshotStore, StreamReader,
};
use thiserror::Error;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{UnixListener, UnixStream},
    sync::{Mutex, Semaphore, mpsc},
    time::{Instant, timeout},
};

use crate::TransportMeasurement;

const PROTOCOL_VERSION: u8 = 1;
const HEADER_BYTES: usize = 4;
const SERVER_INSTANCE_BYTES: usize = 16;
const POSITION_MAGIC: &[u8; 4] = b"SSP1";
const POSITION_LENGTH_BYTES: usize = 4;
const POSITION_CHECKSUM_BYTES: usize = 8;
const POSITION_ENVELOPE_BYTES: usize =
    POSITION_MAGIC.len() + SERVER_INSTANCE_BYTES + POSITION_LENGTH_BYTES + POSITION_CHECKSUM_BYTES;
const KIND_CAPABILITIES: u8 = 1;
const KIND_APPEND: u8 = 2;
const KIND_READ: u8 = 3;
const KIND_HEAD: u8 = 4;
const KIND_LATEST: u8 = 5;
const KIND_PUBLISH: u8 = 6;
const KIND_CAPABILITIES_RESPONSE: u8 = 64;
const KIND_RECEIPT: u8 = 65;
const KIND_READ_START: u8 = 66;
const KIND_RECORD: u8 = 67;
const KIND_READ_END: u8 = 68;
const KIND_POSITION: u8 = 69;
const KIND_LATEST_RESPONSE: u8 = 70;
const KIND_SNAPSHOT_ID: u8 = 71;
const KIND_ERROR: u8 = 127;

/// Environment variable used to pass the Unix socket path to a child process.
pub const PROCESS_SOCKET_ENV: &str = "SNAPSHOTTED_STREAM_SOCKET";

/// Explicit bounds and timeouts for one process transport connection.
#[derive(Clone, Debug)]
pub struct ProcessTransportConfig {
    /// Maximum number of records buffered for a client reader.
    pub read_capacity: usize,
    /// Maximum number of concurrently served socket connections.
    pub max_connections: usize,
    /// Maximum complete frame size, excluding its four-byte length prefix.
    pub max_frame_bytes: usize,
    /// Maximum append or record payload size.
    pub max_payload_bytes: usize,
    /// Maximum opaque position token size.
    pub max_position_bytes: usize,
    /// Maximum snapshot payload size.
    pub max_snapshot_bytes: usize,
    /// Timeout applied independently to connect, frame reads, and frame writes.
    pub operation_timeout: Duration,
}

impl Default for ProcessTransportConfig {
    fn default() -> Self {
        Self {
            read_capacity: 1,
            max_connections: 16,
            max_frame_bytes: 1024 * 1024,
            max_payload_bytes: 512 * 1024,
            max_position_bytes: 4096,
            max_snapshot_bytes: 512 * 1024,
            operation_timeout: Duration::from_secs(5),
        }
    }
}

impl ProcessTransportConfig {
    fn validate(&self) -> Result<(), ProcessNetworkError> {
        if self.read_capacity == 0 || self.max_connections == 0 {
            return Err(ProcessNetworkError::InvalidCapacity);
        }
        if self.max_frame_bytes < 2
            || self.max_payload_bytes > self.max_frame_bytes
            || self.max_position_bytes > self.max_frame_bytes
            || self.max_snapshot_bytes > self.max_frame_bytes
        {
            return Err(ProcessNetworkError::InvalidLimits);
        }
        Ok(())
    }
}

/// An opaque position token whose meaning remains exclusively server-owned.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProcessPosition(Bytes);

/// Stable process transport and remote error classifications.
#[derive(Debug, Error)]
pub enum ProcessNetworkError {
    /// The peer closed the socket before the operation completed.
    #[error("transport disconnected")]
    Disconnected,
    /// A bounded operation exceeded its configured timeout.
    #[error("transport operation timed out")]
    Timeout,
    /// Socket setup or I/O failed.
    #[error("transport I/O failed: {0}")]
    Io(#[source] io::Error),
    /// A zero-capacity reader queue was requested.
    #[error("transport capacity must be greater than zero")]
    InvalidCapacity,
    /// Frame and field limits are internally inconsistent.
    #[error("transport limits are invalid")]
    InvalidLimits,
    /// A frame exceeded the configured maximum.
    #[error("transport frame exceeds the configured limit")]
    FrameTooLarge,
    /// A frame did not conform to protocol version 1.
    #[error("transport frame is malformed")]
    MalformedFrame,
    /// A payload exceeded its explicit field limit.
    #[error("transport payload exceeds the configured limit")]
    PayloadTooLarge,
    /// An opaque position token was empty or exceeded its explicit field limit.
    #[error("position token is malformed")]
    InvalidPositionToken,
    /// The server returned a stable backend error class.
    #[error("remote operation failed: {0:?}")]
    Remote(ErrorKind),
}

impl ClassifiedError for ProcessNetworkError {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Disconnected | Self::Timeout | Self::Io(_) => ErrorKind::Unavailable,
            Self::InvalidCapacity
            | Self::InvalidLimits
            | Self::FrameTooLarge
            | Self::PayloadTooLarge => ErrorKind::Rejected,
            Self::MalformedFrame => ErrorKind::Corrupt,
            Self::InvalidPositionToken => ErrorKind::InvalidPosition,
            Self::Remote(kind) => *kind,
        }
    }
}

#[derive(Debug, Default)]
struct ProcessMetrics {
    wire_bytes: AtomicU64,
    peak_queued_records: AtomicUsize,
}

impl ProcessMetrics {
    fn add_wire_bytes(&self, bytes: usize) {
        self.wire_bytes.fetch_add(bytes as u64, Ordering::Relaxed);
    }

    fn observe_queue(&self, queued: usize) {
        self.peak_queued_records
            .fetch_max(queued, Ordering::Relaxed);
    }

    fn snapshot(&self) -> TransportMeasurement {
        TransportMeasurement {
            wire_bytes: self.wire_bytes.load(Ordering::Relaxed),
            peak_queued_records: self.peak_queued_records.load(Ordering::Relaxed),
        }
    }
}

/// A cloneable client connected to one child-process socket connection.
#[derive(Clone, Debug)]
pub struct ProcessClient {
    stream: Arc<Mutex<UnixStream>>,
    config: ProcessTransportConfig,
    capabilities: Capabilities,
    server_instance: [u8; SERVER_INSTANCE_BYTES],
    metrics: Arc<ProcessMetrics>,
}

impl ProcessClient {
    /// Connects to an already-starting server, with bounded startup synchronization.
    ///
    /// This retries only initial socket establishment. Operations never retry or reconnect.
    ///
    /// # Errors
    ///
    /// Returns a configuration, timeout, or socket error when setup cannot complete.
    pub async fn connect(
        socket_path: impl AsRef<Path>,
        config: ProcessTransportConfig,
    ) -> Result<Self, ProcessNetworkError> {
        config.validate()?;
        let deadline = Instant::now() + config.operation_timeout;
        let stream = loop {
            match UnixStream::connect(socket_path.as_ref()).await {
                Ok(stream) => break stream,
                Err(error)
                    if matches!(
                        error.kind(),
                        io::ErrorKind::NotFound | io::ErrorKind::ConnectionRefused
                    ) && Instant::now() < deadline =>
                {
                    tokio::task::yield_now().await;
                }
                Err(error) => return Err(ProcessNetworkError::Io(error)),
            }
        };
        let metrics = Arc::new(ProcessMetrics::default());
        let mut client = Self {
            stream: Arc::new(Mutex::new(stream)),
            config,
            capabilities: Capabilities::NONE,
            server_instance: [0; SERVER_INSTANCE_BYTES],
            metrics,
        };
        let response = client
            .unary(Frame::new(KIND_CAPABILITIES, Vec::new())?)
            .await?;
        (client.capabilities, client.server_instance) = decode_capabilities(&response)?;
        Ok(client)
    }

    /// Returns wire-byte and bounded-reader queue measurements for this connection.
    #[must_use]
    pub fn measurement(&self) -> TransportMeasurement {
        self.metrics.snapshot()
    }

    async fn unary(&self, request: Frame) -> Result<Frame, ProcessNetworkError> {
        let mut stream = self.stream.lock().await;
        let written = write_frame(&mut stream, &request, &self.config).await?;
        self.metrics.add_wire_bytes(written);
        let (response, read) = read_frame(&mut stream, &self.config).await?;
        self.metrics.add_wire_bytes(read);
        decode_remote_error(response)
    }

    fn validate_position(&self, position: &ProcessPosition) -> Result<(), ProcessNetworkError> {
        decode_position_envelope(&position.0, &self.server_instance, &self.config).map(|_| ())
    }
}

#[async_trait]
impl AppendStream for ProcessClient {
    type Position = ProcessPosition;
    type Error = ProcessNetworkError;

    fn capabilities(&self) -> Capabilities {
        self.capabilities
    }

    async fn append(&self, value: Bytes) -> Result<AppendReceipt<Self::Position>, Self::Error> {
        if value.len() > self.config.max_payload_bytes {
            return Err(ProcessNetworkError::PayloadTooLarge);
        }
        let response = self.unary(Frame::new(KIND_APPEND, value.to_vec())?).await?;
        decode_receipt(&response, &self.server_instance, &self.config)
    }

    async fn read(
        &self,
        after: Option<&Self::Position>,
    ) -> Result<StreamReader<Self::Position, Self::Error>, Self::Error> {
        let mut payload = Encoder::default();
        payload.optional_token(
            after.map(|position| &position.0),
            &self.server_instance,
            &self.config,
        )?;
        let request = Frame::new(KIND_READ, payload.finish())?;
        let mut stream = Arc::clone(&self.stream).lock_owned().await;
        let written = write_frame(&mut stream, &request, &self.config).await?;
        self.metrics.add_wire_bytes(written);
        let (response, read) = read_frame(&mut stream, &self.config).await?;
        self.metrics.add_wire_bytes(read);
        let response = decode_remote_error(response)?;
        if response.kind != KIND_READ_START || !response.payload.is_empty() {
            return Err(ProcessNetworkError::MalformedFrame);
        }

        let (sender, receiver) = mpsc::channel(self.config.read_capacity);
        let config = self.config.clone();
        let server_instance = self.server_instance;
        let metrics = Arc::clone(&self.metrics);
        tokio::spawn(async move {
            loop {
                let next = read_frame(&mut stream, &config).await;
                let (frame, bytes) = match next {
                    Ok(value) => value,
                    Err(error) => {
                        let _ = sender.send(Err(error)).await;
                        return;
                    }
                };
                metrics.add_wire_bytes(bytes);
                match decode_remote_error(frame) {
                    Ok(frame) if frame.kind == KIND_RECORD => {
                        let record = decode_record(&frame, &server_instance, &config);
                        if sender.send(record).await.is_err() {
                            return;
                        }
                        metrics.observe_queue(sender.max_capacity() - sender.capacity());
                    }
                    Ok(frame) if frame.kind == KIND_READ_END && frame.payload.is_empty() => return,
                    Ok(_) => {
                        let _ = sender.send(Err(ProcessNetworkError::MalformedFrame)).await;
                        return;
                    }
                    Err(error) => {
                        let _ = sender.send(Err(error)).await;
                        return;
                    }
                }
            }
        });
        Ok(Box::pin(futures_util::stream::unfold(
            receiver,
            |mut receiver| async move { receiver.recv().await.map(|item| (item, receiver)) },
        )))
    }

    async fn head(&self) -> Result<Option<Self::Position>, Self::Error> {
        let response = self.unary(Frame::new(KIND_HEAD, Vec::new())?).await?;
        decode_optional_position(&response, &self.server_instance, &self.config)
    }
}

impl PositionCodec for ProcessClient {
    fn encode_position(&self, position: &Self::Position) -> Result<Bytes, Self::Error> {
        self.validate_position(position)?;
        Ok(position.0.clone())
    }

    fn decode_position(&self, token: &[u8]) -> Result<Self::Position, Self::Error> {
        decode_position_envelope(token, &self.server_instance, &self.config)?;
        Ok(ProcessPosition(Bytes::copy_from_slice(token)))
    }
}

#[async_trait]
impl SnapshotStore for ProcessClient {
    type Position = ProcessPosition;
    type Error = ProcessNetworkError;

    async fn latest(&self) -> Result<Option<PublishedSnapshot<Self::Position>>, Self::Error> {
        let response = self.unary(Frame::new(KIND_LATEST, Vec::new())?).await?;
        decode_latest(&response, &self.server_instance, &self.config)
    }

    async fn publish(
        &self,
        snapshot: Snapshot<Self::Position>,
        expected_parent: Option<&SnapshotId>,
    ) -> Result<SnapshotId, Self::Error> {
        if snapshot.payload.len() > self.config.max_snapshot_bytes {
            return Err(ProcessNetworkError::PayloadTooLarge);
        }
        let mut payload = Encoder::default();
        payload.snapshot_position(
            &snapshot.includes_through,
            &self.server_instance,
            &self.config,
        )?;
        payload.bytes(&snapshot.payload)?;
        payload.optional_bytes(expected_parent.map(SnapshotId::as_bytes))?;
        let response = self
            .unary(Frame::new(KIND_PUBLISH, payload.finish())?)
            .await?;
        decode_snapshot_id(&response, &self.config)
    }
}

/// Child process ownership plus deterministic cleanup of its socket path.
#[derive(Debug)]
pub struct ProcessServer {
    child: Child,
    socket_path: PathBuf,
}

impl ProcessServer {
    /// Spawns a server command after injecting [`PROCESS_SOCKET_ENV`].
    ///
    /// # Errors
    ///
    /// Returns an I/O error when the child cannot be spawned.
    pub fn spawn(
        command: &mut Command,
        socket_path: impl Into<PathBuf>,
    ) -> Result<Self, ProcessNetworkError> {
        let socket_path = socket_path.into();
        command.env(PROCESS_SOCKET_ENV, &socket_path);
        let child = command.spawn().map_err(ProcessNetworkError::Io)?;
        Ok(Self { child, socket_path })
    }

    /// Abruptly terminates the child. Clients observe an unavailable error without retry.
    ///
    /// # Errors
    ///
    /// Returns an I/O error when the child cannot be killed or reaped.
    pub fn disconnect(&mut self) -> Result<(), ProcessNetworkError> {
        match self.child.kill() {
            Ok(()) => {
                self.child.wait().map_err(ProcessNetworkError::Io)?;
                Ok(())
            }
            Err(error) if error.kind() == io::ErrorKind::InvalidInput => Ok(()),
            Err(error) => Err(ProcessNetworkError::Io(error)),
        }
    }
}

impl Drop for ProcessServer {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_file(&self.socket_path);
    }
}

/// Serves bounded requests over a Unix socket. The backend and its codec remain in this process.
///
/// # Errors
///
/// Returns a configuration or socket error when listener setup or acceptance fails.
pub async fn serve_unix<S>(
    socket_path: impl AsRef<Path>,
    backend: S,
    config: ProcessTransportConfig,
) -> Result<(), ProcessNetworkError>
where
    S: AppendStream
        + PositionCodec
        + SnapshotStore<Position = <S as AppendStream>::Position, Error = <S as AppendStream>::Error>
        + Clone
        + 'static,
{
    config.validate()?;
    match std::fs::remove_file(socket_path.as_ref()) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(ProcessNetworkError::Io(error)),
    }
    let listener = UnixListener::bind(socket_path.as_ref()).map_err(ProcessNetworkError::Io)?;
    let server_instance = new_server_instance();
    let permits = Arc::new(Semaphore::new(config.max_connections));
    loop {
        let permit = Arc::clone(&permits)
            .acquire_owned()
            .await
            .map_err(|_| ProcessNetworkError::Disconnected)?;
        let (mut stream, _) = listener.accept().await.map_err(ProcessNetworkError::Io)?;
        let connection_backend = backend.clone();
        let connection_config = config.clone();
        tokio::spawn(async move {
            let _permit = permit;
            let result = serve_connection(
                &mut stream,
                connection_backend,
                &server_instance,
                &connection_config,
            )
            .await;
            if let Err(error) = result {
                let _ = write_error(&mut stream, error.kind(), &connection_config).await;
            }
        });
    }
}

async fn serve_connection<S>(
    stream: &mut UnixStream,
    backend: S,
    server_instance: &[u8; SERVER_INSTANCE_BYTES],
    config: &ProcessTransportConfig,
) -> Result<(), ProcessNetworkError>
where
    S: AppendStream
        + PositionCodec
        + SnapshotStore<Position = <S as AppendStream>::Position, Error = <S as AppendStream>::Error>,
{
    loop {
        let (request, _) = read_frame(stream, config).await?;
        match request.kind {
            KIND_CAPABILITIES if request.payload.is_empty() => {
                let frame = encode_capabilities(backend.capabilities(), server_instance)?;
                write_frame(stream, &frame, config).await?;
            }
            KIND_APPEND => {
                if request.payload.len() > config.max_payload_bytes {
                    write_error(stream, ErrorKind::Rejected, config).await?;
                    continue;
                }
                match backend.append(Bytes::from(request.payload)).await {
                    Ok(receipt) => {
                        let frame = encode_receipt(&backend, &receipt, config)?;
                        write_frame(stream, &frame, config).await?;
                    }
                    Err(error) => write_error(stream, error.kind(), config).await?,
                }
            }
            KIND_READ => {
                let after =
                    decode_request_position(&backend, &request, server_instance, config)?;
                match backend.read(after.as_ref()).await {
                    Ok(mut reader) => {
                        write_frame(stream, &Frame::new(KIND_READ_START, Vec::new())?, config)
                            .await?;
                        while let Some(record) = reader.next().await {
                            match record {
                                Ok(record) => {
                                    let frame = encode_record(&backend, &record, config)?;
                                    write_frame(stream, &frame, config).await?;
                                }
                                Err(error) => {
                                    write_error(stream, error.kind(), config).await?;
                                    break;
                                }
                            }
                        }
                        write_frame(stream, &Frame::new(KIND_READ_END, Vec::new())?, config)
                            .await?;
                    }
                    Err(error) => write_error(stream, error.kind(), config).await?,
                }
            }
            KIND_HEAD if request.payload.is_empty() => match backend.head().await {
                Ok(position) => {
                    let frame = encode_optional_position(&backend, position.as_ref(), config)?;
                    write_frame(stream, &frame, config).await?;
                }
                Err(error) => write_error(stream, error.kind(), config).await?,
            },
            KIND_LATEST if request.payload.is_empty() => match backend.latest().await {
                Ok(snapshot) => {
                    let frame = encode_latest(&backend, snapshot, config)?;
                    write_frame(stream, &frame, config).await?;
                }
                Err(error) => write_error(stream, error.kind(), config).await?,
            },
            KIND_PUBLISH => {
                let (snapshot, expected_parent) =
                    decode_publish_request(&backend, &request, server_instance, config)?;
                match backend.publish(snapshot, expected_parent.as_ref()).await {
                    Ok(id) => {
                        let frame = encode_snapshot_id(&id)?;
                        write_frame(stream, &frame, config).await?;
                    }
                    Err(error) => write_error(stream, error.kind(), config).await?,
                }
            }
            _ => return Err(ProcessNetworkError::MalformedFrame),
        }
    }
}

#[derive(Debug)]
struct Frame {
    kind: u8,
    payload: Vec<u8>,
}

impl Frame {
    fn new(kind: u8, payload: Vec<u8>) -> Result<Self, ProcessNetworkError> {
        if kind == 0 {
            Err(ProcessNetworkError::MalformedFrame)
        } else {
            Ok(Self { kind, payload })
        }
    }
}

async fn write_frame(
    stream: &mut UnixStream,
    frame: &Frame,
    config: &ProcessTransportConfig,
) -> Result<usize, ProcessNetworkError> {
    let frame_len = 2_usize
        .checked_add(frame.payload.len())
        .ok_or(ProcessNetworkError::FrameTooLarge)?;
    if frame_len > config.max_frame_bytes || frame_len > u32::MAX as usize {
        return Err(ProcessNetworkError::FrameTooLarge);
    }
    let mut encoded = Vec::with_capacity(HEADER_BYTES + frame_len);
    let frame_len = u32::try_from(frame_len).map_err(|_| ProcessNetworkError::FrameTooLarge)?;
    encoded.extend_from_slice(&frame_len.to_be_bytes());
    encoded.push(PROTOCOL_VERSION);
    encoded.push(frame.kind);
    encoded.extend_from_slice(&frame.payload);
    timeout(config.operation_timeout, stream.write_all(&encoded))
        .await
        .map_err(|_| ProcessNetworkError::Timeout)?
        .map_err(ProcessNetworkError::Io)?;
    Ok(encoded.len())
}

async fn read_frame(
    stream: &mut UnixStream,
    config: &ProcessTransportConfig,
) -> Result<(Frame, usize), ProcessNetworkError> {
    let mut header = [0_u8; HEADER_BYTES];
    timeout(config.operation_timeout, stream.read_exact(&mut header))
        .await
        .map_err(|_| ProcessNetworkError::Timeout)?
        .map_err(map_read_error)?;
    let frame_len = u32::from_be_bytes(header) as usize;
    if frame_len > config.max_frame_bytes {
        return Err(ProcessNetworkError::FrameTooLarge);
    }
    if frame_len < 2 {
        return Err(ProcessNetworkError::MalformedFrame);
    }
    let mut encoded = vec![0_u8; frame_len];
    timeout(config.operation_timeout, stream.read_exact(&mut encoded))
        .await
        .map_err(|_| ProcessNetworkError::Timeout)?
        .map_err(map_read_error)?;
    if encoded[0] != PROTOCOL_VERSION {
        return Err(ProcessNetworkError::MalformedFrame);
    }
    Ok((
        Frame {
            kind: encoded[1],
            payload: encoded[2..].to_vec(),
        },
        HEADER_BYTES + frame_len,
    ))
}

fn map_read_error(error: io::Error) -> ProcessNetworkError {
    if matches!(
        error.kind(),
        io::ErrorKind::UnexpectedEof | io::ErrorKind::ConnectionReset | io::ErrorKind::BrokenPipe
    ) {
        ProcessNetworkError::Disconnected
    } else {
        ProcessNetworkError::Io(error)
    }
}

async fn write_error(
    stream: &mut UnixStream,
    kind: ErrorKind,
    config: &ProcessTransportConfig,
) -> Result<(), ProcessNetworkError> {
    write_frame(
        stream,
        &Frame::new(KIND_ERROR, vec![encode_error_kind(kind)])?,
        config,
    )
    .await
    .map(|_| ())
}

fn decode_remote_error(frame: Frame) -> Result<Frame, ProcessNetworkError> {
    if frame.kind != KIND_ERROR {
        return Ok(frame);
    }
    if frame.payload.len() != 1 {
        return Err(ProcessNetworkError::MalformedFrame);
    }
    Err(ProcessNetworkError::Remote(decode_error_kind(
        frame.payload[0],
    )?))
}

fn encode_error_kind(kind: ErrorKind) -> u8 {
    match kind {
        ErrorKind::InvalidPosition => 0,
        ErrorKind::StalePosition => 1,
        ErrorKind::Conflict => 2,
        ErrorKind::Rejected => 3,
        ErrorKind::Ambiguous => 4,
        ErrorKind::Unavailable => 5,
        ErrorKind::Corrupt => 6,
    }
}

fn decode_error_kind(value: u8) -> Result<ErrorKind, ProcessNetworkError> {
    match value {
        0 => Ok(ErrorKind::InvalidPosition),
        1 => Ok(ErrorKind::StalePosition),
        2 => Ok(ErrorKind::Conflict),
        3 => Ok(ErrorKind::Rejected),
        4 => Ok(ErrorKind::Ambiguous),
        5 => Ok(ErrorKind::Unavailable),
        6 => Ok(ErrorKind::Corrupt),
        _ => Err(ProcessNetworkError::MalformedFrame),
    }
}

#[derive(Default)]
struct Encoder(Vec<u8>);

impl Encoder {
    fn byte(&mut self, value: u8) {
        self.0.push(value);
    }

    fn bytes(&mut self, value: &[u8]) -> Result<(), ProcessNetworkError> {
        let length = u32::try_from(value.len()).map_err(|_| ProcessNetworkError::FrameTooLarge)?;
        self.0.extend_from_slice(&length.to_be_bytes());
        self.0.extend_from_slice(value);
        Ok(())
    }

    fn optional_bytes(&mut self, value: Option<&Bytes>) -> Result<(), ProcessNetworkError> {
        if let Some(value) = value {
            self.byte(1);
            self.bytes(value)
        } else {
            self.byte(0);
            Ok(())
        }
    }

    fn optional_token(
        &mut self,
        value: Option<&Bytes>,
        server_instance: &[u8; SERVER_INSTANCE_BYTES],
        config: &ProcessTransportConfig,
    ) -> Result<(), ProcessNetworkError> {
        if let Some(value) = value {
            decode_position_envelope(value, server_instance, config)?;
        }
        self.optional_bytes(value)
    }

    fn snapshot_position(
        &mut self,
        position: &SnapshotPosition<ProcessPosition>,
        server_instance: &[u8; SERVER_INSTANCE_BYTES],
        config: &ProcessTransportConfig,
    ) -> Result<(), ProcessNetworkError> {
        match position {
            SnapshotPosition::Initial => {
                self.byte(0);
                Ok(())
            }
            SnapshotPosition::At(position) => {
                decode_position_envelope(&position.0, server_instance, config)?;
                self.byte(1);
                self.bytes(&position.0)
            }
        }
    }

    fn finish(self) -> Vec<u8> {
        self.0
    }
}

struct Decoder<'a> {
    remaining: &'a [u8],
}

impl<'a> Decoder<'a> {
    fn new(value: &'a [u8]) -> Self {
        Self { remaining: value }
    }

    fn byte(&mut self) -> Result<u8, ProcessNetworkError> {
        let Some((&value, remaining)) = self.remaining.split_first() else {
            return Err(ProcessNetworkError::MalformedFrame);
        };
        self.remaining = remaining;
        Ok(value)
    }

    fn bytes(&mut self) -> Result<&'a [u8], ProcessNetworkError> {
        if self.remaining.len() < 4 {
            return Err(ProcessNetworkError::MalformedFrame);
        }
        let length = u32::from_be_bytes(
            self.remaining[..4]
                .try_into()
                .map_err(|_| ProcessNetworkError::MalformedFrame)?,
        ) as usize;
        self.remaining = &self.remaining[4..];
        if self.remaining.len() < length {
            return Err(ProcessNetworkError::MalformedFrame);
        }
        let (value, remaining) = self.remaining.split_at(length);
        self.remaining = remaining;
        Ok(value)
    }

    fn optional_bytes(&mut self) -> Result<Option<&'a [u8]>, ProcessNetworkError> {
        match self.byte()? {
            0 => Ok(None),
            1 => self.bytes().map(Some),
            _ => Err(ProcessNetworkError::MalformedFrame),
        }
    }

    fn finish(self) -> Result<(), ProcessNetworkError> {
        if self.remaining.is_empty() {
            Ok(())
        } else {
            Err(ProcessNetworkError::MalformedFrame)
        }
    }
}

fn validate_token(
    token: &[u8],
    config: &ProcessTransportConfig,
) -> Result<(), ProcessNetworkError> {
    if token.is_empty() || token.len() > config.max_position_bytes {
        Err(ProcessNetworkError::InvalidPositionToken)
    } else {
        Ok(())
    }
}

fn new_server_instance() -> [u8; SERVER_INSTANCE_BYTES] {
    let mut instance = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        .to_be_bytes();
    let process_id = std::process::id().to_be_bytes();
    for (target, source) in instance[SERVER_INSTANCE_BYTES - process_id.len()..]
        .iter_mut()
        .zip(process_id)
    {
        *target ^= source;
    }
    instance
}

fn position_checksum(value: &[u8]) -> u64 {
    value.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

fn encode_position_envelope(
    backend_token: &[u8],
    server_instance: &[u8; SERVER_INSTANCE_BYTES],
    config: &ProcessTransportConfig,
) -> Result<Bytes, ProcessNetworkError> {
    validate_token(backend_token, config)?;
    let backend_length = u32::try_from(backend_token.len())
        .map_err(|_| ProcessNetworkError::InvalidPositionToken)?;
    let mut envelope = Vec::with_capacity(POSITION_ENVELOPE_BYTES + backend_token.len());
    envelope.extend_from_slice(POSITION_MAGIC);
    envelope.extend_from_slice(server_instance);
    envelope.extend_from_slice(&backend_length.to_be_bytes());
    envelope.extend_from_slice(backend_token);
    envelope.extend_from_slice(&position_checksum(&envelope).to_be_bytes());
    Ok(Bytes::from(envelope))
}

fn decode_position_envelope<'a>(
    envelope: &'a [u8],
    server_instance: &[u8; SERVER_INSTANCE_BYTES],
    config: &ProcessTransportConfig,
) -> Result<&'a [u8], ProcessNetworkError> {
    if envelope.len() < POSITION_ENVELOPE_BYTES + 1
        || &envelope[..POSITION_MAGIC.len()] != POSITION_MAGIC
    {
        return Err(ProcessNetworkError::InvalidPositionToken);
    }
    let instance_start = POSITION_MAGIC.len();
    let length_start = instance_start + SERVER_INSTANCE_BYTES;
    if envelope[instance_start..length_start] != server_instance[..] {
        return Err(ProcessNetworkError::InvalidPositionToken);
    }
    let token_start = length_start + POSITION_LENGTH_BYTES;
    let backend_length = u32::from_be_bytes(
        envelope[length_start..token_start]
            .try_into()
            .map_err(|_| ProcessNetworkError::InvalidPositionToken)?,
    ) as usize;
    let expected_length = POSITION_ENVELOPE_BYTES
        .checked_add(backend_length)
        .ok_or(ProcessNetworkError::InvalidPositionToken)?;
    if envelope.len() != expected_length {
        return Err(ProcessNetworkError::InvalidPositionToken);
    }
    let checksum_start = token_start + backend_length;
    let expected_checksum = u64::from_be_bytes(
        envelope[checksum_start..]
            .try_into()
            .map_err(|_| ProcessNetworkError::InvalidPositionToken)?,
    );
    if position_checksum(&envelope[..checksum_start]) != expected_checksum {
        return Err(ProcessNetworkError::InvalidPositionToken);
    }
    let backend_token = &envelope[token_start..checksum_start];
    validate_token(backend_token, config)?;
    Ok(backend_token)
}

fn encode_capabilities(
    capabilities: Capabilities,
    server_instance: &[u8; SERVER_INSTANCE_BYTES],
) -> Result<Frame, ProcessNetworkError> {
    let all = [
        Capability::LiveTailing,
        Capability::PositionSerialization,
        Capability::Retention,
        Capability::IdempotentAppend,
    ];
    let bits = all
        .iter()
        .enumerate()
        .fold(0_u8, |bits, (index, capability)| {
            bits | u8::from(capabilities.supports(*capability)) << index
        });
    let mut payload = Vec::with_capacity(1 + SERVER_INSTANCE_BYTES);
    payload.push(bits);
    payload.extend_from_slice(server_instance);
    Frame::new(KIND_CAPABILITIES_RESPONSE, payload)
}

fn decode_capabilities(
    frame: &Frame,
) -> Result<(Capabilities, [u8; SERVER_INSTANCE_BYTES]), ProcessNetworkError> {
    if frame.kind != KIND_CAPABILITIES_RESPONSE || frame.payload.len() != 1 + SERVER_INSTANCE_BYTES {
        return Err(ProcessNetworkError::MalformedFrame);
    }
    let all = [
        Capability::LiveTailing,
        Capability::PositionSerialization,
        Capability::Retention,
        Capability::IdempotentAppend,
    ];
    let capabilities = all
        .iter()
        .enumerate()
        .fold(Capabilities::NONE, |capabilities, (index, capability)| {
            if frame.payload[0] & (1 << index) == 0 {
                capabilities
            } else {
                capabilities.with(*capability)
            }
        });
    let server_instance = frame.payload[1..]
        .try_into()
        .map_err(|_| ProcessNetworkError::MalformedFrame)?;
    Ok((capabilities, server_instance))
}

fn encode_receipt<S: PositionCodec>(
    backend: &S,
    receipt: &AppendReceipt<S::Position>,
    config: &ProcessTransportConfig,
) -> Result<Frame, ProcessNetworkError> {
    let token = backend
        .encode_position(&receipt.position)
        .map_err(|error| ProcessNetworkError::Remote(error.kind()))?;
    validate_token(&token, config)?;
    let mut payload = Encoder::default();
    payload.bytes(&token)?;
    payload.byte(match receipt.durability {
        Durability::Memory => 0,
        Durability::Buffered => 1,
        Durability::Durable => 2,
    });
    Frame::new(KIND_RECEIPT, payload.finish())
}

fn decode_receipt(
    frame: &Frame,
    server_instance: &[u8; SERVER_INSTANCE_BYTES],
    config: &ProcessTransportConfig,
) -> Result<AppendReceipt<ProcessPosition>, ProcessNetworkError> {
    if frame.kind != KIND_RECEIPT {
        return Err(ProcessNetworkError::MalformedFrame);
    }
    let mut payload = Decoder::new(&frame.payload);
    let token = payload.bytes()?;
    let token = encode_position_envelope(token, server_instance, config)?;
    let durability = match payload.byte()? {
        0 => Durability::Memory,
        1 => Durability::Buffered,
        2 => Durability::Durable,
        _ => return Err(ProcessNetworkError::MalformedFrame),
    };
    payload.finish()?;
    Ok(AppendReceipt {
        position: ProcessPosition(token),
        durability,
    })
}

fn encode_record<S: PositionCodec>(
    backend: &S,
    record: &ReadRecord<S::Position>,
    config: &ProcessTransportConfig,
) -> Result<Frame, ProcessNetworkError> {
    if record.payload.len() > config.max_payload_bytes {
        return Err(ProcessNetworkError::PayloadTooLarge);
    }
    let token = backend
        .encode_position(&record.position)
        .map_err(|error| ProcessNetworkError::Remote(error.kind()))?;
    validate_token(&token, config)?;
    let mut payload = Encoder::default();
    payload.bytes(&token)?;
    payload.bytes(&record.payload)?;
    Frame::new(KIND_RECORD, payload.finish())
}

fn decode_record(
    frame: &Frame,
    server_instance: &[u8; SERVER_INSTANCE_BYTES],
    config: &ProcessTransportConfig,
) -> Result<ReadRecord<ProcessPosition>, ProcessNetworkError> {
    let mut payload = Decoder::new(&frame.payload);
    let token = payload.bytes()?;
    let token = encode_position_envelope(token, server_instance, config)?;
    let value = payload.bytes()?;
    if value.len() > config.max_payload_bytes {
        return Err(ProcessNetworkError::PayloadTooLarge);
    }
    payload.finish()?;
    Ok(ReadRecord {
        position: ProcessPosition(token),
        payload: Bytes::copy_from_slice(value),
    })
}

fn encode_optional_position<S: PositionCodec>(
    backend: &S,
    position: Option<&S::Position>,
    config: &ProcessTransportConfig,
) -> Result<Frame, ProcessNetworkError> {
    let token = position
        .map(|position| backend.encode_position(position))
        .transpose()
        .map_err(|error| ProcessNetworkError::Remote(error.kind()))?;
    if let Some(token) = &token {
        validate_token(token, config)?;
    }
    let mut payload = Encoder::default();
    payload.optional_bytes(token.as_ref())?;
    Frame::new(KIND_POSITION, payload.finish())
}

fn decode_optional_position(
    frame: &Frame,
    server_instance: &[u8; SERVER_INSTANCE_BYTES],
    config: &ProcessTransportConfig,
) -> Result<Option<ProcessPosition>, ProcessNetworkError> {
    if frame.kind != KIND_POSITION {
        return Err(ProcessNetworkError::MalformedFrame);
    }
    let mut payload = Decoder::new(&frame.payload);
    let token = payload.optional_bytes()?;
    let position = token
        .map(|value| encode_position_envelope(value, server_instance, config))
        .transpose()?
        .map(ProcessPosition);
    payload.finish()?;
    Ok(position)
}

fn decode_request_position<S: PositionCodec>(
    backend: &S,
    frame: &Frame,
    server_instance: &[u8; SERVER_INSTANCE_BYTES],
    config: &ProcessTransportConfig,
) -> Result<Option<S::Position>, ProcessNetworkError> {
    let mut payload = Decoder::new(&frame.payload);
    let token = payload.optional_bytes()?;
    let position = token
        .map(|token| {
            decode_position_envelope(token, server_instance, config).and_then(|backend_token| {
                backend
                    .decode_position(backend_token)
                    .map_err(|error| ProcessNetworkError::Remote(error.kind()))
            })
        })
        .transpose()
        ?;
    payload.finish()?;
    Ok(position)
}

fn encode_latest<S: PositionCodec>(
    backend: &S,
    published: Option<PublishedSnapshot<S::Position>>,
    config: &ProcessTransportConfig,
) -> Result<Frame, ProcessNetworkError> {
    let mut payload = Encoder::default();
    match published {
        None => payload.byte(0),
        Some(published) => {
            if published.snapshot.payload.len() > config.max_snapshot_bytes {
                return Err(ProcessNetworkError::PayloadTooLarge);
            }
            payload.byte(1);
            payload.bytes(published.id.as_bytes())?;
            match published.snapshot.includes_through {
                SnapshotPosition::Initial => payload.byte(0),
                SnapshotPosition::At(position) => {
                    let token = backend
                        .encode_position(&position)
                        .map_err(|error| ProcessNetworkError::Remote(error.kind()))?;
                    validate_token(&token, config)?;
                    payload.byte(1);
                    payload.bytes(&token)?;
                }
            }
            payload.bytes(&published.snapshot.payload)?;
        }
    }
    Frame::new(KIND_LATEST_RESPONSE, payload.finish())
}

fn decode_latest(
    frame: &Frame,
    server_instance: &[u8; SERVER_INSTANCE_BYTES],
    config: &ProcessTransportConfig,
) -> Result<Option<PublishedSnapshot<ProcessPosition>>, ProcessNetworkError> {
    if frame.kind != KIND_LATEST_RESPONSE {
        return Err(ProcessNetworkError::MalformedFrame);
    }
    let mut payload = Decoder::new(&frame.payload);
    let published = match payload.byte()? {
        0 => None,
        1 => {
            let id = SnapshotId::from_bytes(Bytes::copy_from_slice(payload.bytes()?));
            let includes_through = match payload.byte()? {
                0 => SnapshotPosition::Initial,
                1 => {
                    let token = payload.bytes()?;
                    SnapshotPosition::At(ProcessPosition(encode_position_envelope(
                        token,
                        server_instance,
                        config,
                    )?))
                }
                _ => return Err(ProcessNetworkError::MalformedFrame),
            };
            let snapshot_payload = payload.bytes()?;
            if snapshot_payload.len() > config.max_snapshot_bytes {
                return Err(ProcessNetworkError::PayloadTooLarge);
            }
            Some(PublishedSnapshot {
                id,
                snapshot: Snapshot {
                    includes_through,
                    payload: Bytes::copy_from_slice(snapshot_payload),
                },
            })
        }
        _ => return Err(ProcessNetworkError::MalformedFrame),
    };
    payload.finish()?;
    Ok(published)
}

fn decode_publish_request<S: PositionCodec>(
    backend: &S,
    frame: &Frame,
    server_instance: &[u8; SERVER_INSTANCE_BYTES],
    config: &ProcessTransportConfig,
) -> Result<(Snapshot<S::Position>, Option<SnapshotId>), ProcessNetworkError> {
    let mut payload = Decoder::new(&frame.payload);
    let includes_through = match payload.byte()? {
        0 => SnapshotPosition::Initial,
        1 => {
            let token = payload.bytes()?;
            SnapshotPosition::At(
                backend
                    .decode_position(decode_position_envelope(
                        token,
                        server_instance,
                        config,
                    )?)
                    .map_err(|error| ProcessNetworkError::Remote(error.kind()))?,
            )
        }
        _ => return Err(ProcessNetworkError::MalformedFrame),
    };
    let snapshot_payload = payload.bytes()?;
    if snapshot_payload.len() > config.max_snapshot_bytes {
        return Err(ProcessNetworkError::PayloadTooLarge);
    }
    let expected_parent = payload
        .optional_bytes()?
        .map(|value| SnapshotId::from_bytes(Bytes::copy_from_slice(value)));
    let snapshot = Snapshot {
        includes_through,
        payload: Bytes::copy_from_slice(snapshot_payload),
    };
    payload.finish()?;
    Ok((snapshot, expected_parent))
}

fn encode_snapshot_id(id: &SnapshotId) -> Result<Frame, ProcessNetworkError> {
    let mut payload = Encoder::default();
    payload.bytes(id.as_bytes())?;
    Frame::new(KIND_SNAPSHOT_ID, payload.finish())
}

fn decode_snapshot_id(
    frame: &Frame,
    config: &ProcessTransportConfig,
) -> Result<SnapshotId, ProcessNetworkError> {
    if frame.kind != KIND_SNAPSHOT_ID {
        return Err(ProcessNetworkError::MalformedFrame);
    }
    let mut payload = Decoder::new(&frame.payload);
    let value = payload.bytes()?;
    if value.len() > config.max_position_bytes {
        return Err(ProcessNetworkError::MalformedFrame);
    }
    let id = SnapshotId::from_bytes(Bytes::copy_from_slice(value));
    payload.finish()?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use std::{
        collections::VecDeque,
        env,
        process::Command,
        sync::{
            Arc, Mutex as StdMutex,
            atomic::{AtomicU64, Ordering},
        },
    };

    use futures_util::{StreamExt, TryStreamExt};
    use snapshotted_stream_compression::CompressionStream;
    use snapshotted_stream_memory::MemoryStream;

    use super::*;

    const CHILD_MARKER_ENV: &str = "SNAPSHOTTED_STREAM_TEST_CHILD";
    static NEXT_SOCKET: AtomicU64 = AtomicU64::new(1);

    fn socket_path() -> PathBuf {
        env::temp_dir().join(format!(
            "snapshotted-stream-{}-{}.sock",
            std::process::id(),
            NEXT_SOCKET.fetch_add(1, Ordering::Relaxed)
        ))
    }

    async fn spawned() -> (ProcessClient, ProcessServer, PathBuf) {
        let path = socket_path();
        let executable = env::current_exe().expect("test executable");
        let mut command = Command::new(executable);
        command
            .arg("--ignored")
            .arg("--exact")
            .arg("process::tests::process_server_child")
            .arg("--nocapture")
            .env(CHILD_MARKER_ENV, "1");
        let server = ProcessServer::spawn(&mut command, path.clone()).expect("spawn child server");
        let client = ProcessClient::connect(&path, ProcessTransportConfig::default())
            .await
            .expect("connect to child server");
        (client, server, path)
    }

    #[tokio::test]
    #[ignore = "launched by parent process transport tests"]
    async fn process_server_child() {
        if env::var_os(CHILD_MARKER_ENV).is_none() {
            return;
        }
        let path = env::var_os(PROCESS_SOCKET_ENV).expect("socket path environment variable");
        serve_unix(path, MemoryStream::new(), ProcessTransportConfig::default())
            .await
            .expect("child server failed");
    }

    #[tokio::test]
    async fn capacity_one_child_process_reconnect_resumes_opaque_position() {
        let (client, _server, path) = spawned().await;
        for value in b"abc" {
            client
                .append(Bytes::copy_from_slice(&[*value]))
                .await
                .unwrap();
        }

        let mut reader = client.read(None).await.unwrap();
        let first = reader.next().await.unwrap().unwrap();
        assert_eq!(first.payload, Bytes::from_static(b"a"));
        let token = client.encode_position(&first.position).unwrap();
        drop(reader);
        drop(client);

        let reconnected = ProcessClient::connect(&path, ProcessTransportConfig::default())
            .await
            .unwrap();
        let opaque = reconnected.decode_position(&token).unwrap();
        let resumed = reconnected
            .read(Some(&opaque))
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(
            resumed
                .iter()
                .map(|record| record.payload[0])
                .collect::<Vec<_>>(),
            b"bc"
        );
        assert_eq!(reconnected.measurement().peak_queued_records, 1);
    }

    #[tokio::test]
    async fn child_process_read_is_finite_and_capacity_bounded() {
        let (client, _server, path) = spawned().await;
        for value in 0_u8..4 {
            client
                .append(Bytes::copy_from_slice(&[value]))
                .await
                .unwrap();
        }
        let reader = client.read(None).await.unwrap();
        let later_client = ProcessClient::connect(path, ProcessTransportConfig::default())
            .await
            .unwrap();
        later_client
            .append(Bytes::from_static(b"later"))
            .await
            .unwrap();
        tokio::task::yield_now().await;

        let records = reader.try_collect::<Vec<_>>().await.unwrap();
        assert_eq!(records.len(), 4);
        assert_eq!(client.measurement().peak_queued_records, 1);
    }

    #[tokio::test]
    async fn child_process_snapshots_recover_only_tail() {
        let (client, _server, _path) = spawned().await;
        client.append(Bytes::from_static(b"one")).await.unwrap();
        let through = client.append(Bytes::from_static(b"two")).await.unwrap();
        let id = client
            .publish(
                Snapshot {
                    includes_through: SnapshotPosition::At(through.position.clone()),
                    payload: Bytes::from_static(b"state-two"),
                },
                None,
            )
            .await
            .unwrap();
        client.append(Bytes::from_static(b"three")).await.unwrap();

        let latest = client.latest().await.unwrap().unwrap();
        assert_eq!(latest.id, id);
        assert_eq!(latest.snapshot.payload, Bytes::from_static(b"state-two"));
        let SnapshotPosition::At(position) = latest.snapshot.includes_through else {
            panic!("snapshot position should not be initial");
        };
        let tail = client
            .read(Some(&position))
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(tail.len(), 1);
        assert_eq!(tail[0].payload, Bytes::from_static(b"three"));
    }

    #[tokio::test]
    async fn child_process_rejects_foreign_and_malformed_tokens() {
        let (first, _first_server, _first_path) = spawned().await;
        let receipt = first.append(Bytes::from_static(b"value")).await.unwrap();
        let foreign_token = first.encode_position(&receipt.position).unwrap();
        let mut corrupted_token = foreign_token.to_vec();
        *corrupted_token.last_mut().unwrap() ^= 1;
        assert_eq!(
            first
                .decode_position(&corrupted_token)
                .unwrap_err()
                .kind(),
            ErrorKind::InvalidPosition
        );
        let (second, _second_server, _second_path) = spawned().await;
        assert_eq!(
            second.decode_position(&foreign_token).unwrap_err().kind(),
            ErrorKind::InvalidPosition
        );
        assert_eq!(
            second.encode_position(&receipt.position).unwrap_err().kind(),
            ErrorKind::InvalidPosition
        );
        assert_eq!(
            second
                .decode_position(b"not-a-process-position")
                .unwrap_err()
                .kind(),
            ErrorKind::InvalidPosition
        );
        assert_eq!(
            second.decode_position(&[]).unwrap_err().kind(),
            ErrorKind::InvalidPosition
        );
    }

    #[tokio::test]
    async fn passes_position_codec_conformance() {
        let (first, _first_server, _first_path) = spawned().await;
        let (second, _second_server, _second_path) = spawned().await;
        let clients = Arc::new(StdMutex::new(VecDeque::from([first, second])));
        snapshotted_stream_conformance::run_position_codec_conformance(
            || clients.lock().unwrap().pop_front().unwrap(),
            b"not-a-process-position",
        )
        .await;
    }

    #[tokio::test]
    async fn child_process_disconnect_is_unavailable_without_retry() {
        let (client, mut server, _path) = spawned().await;
        server.disconnect().unwrap();
        assert_eq!(
            client.head().await.unwrap_err().kind(),
            ErrorKind::Unavailable
        );
    }

    #[tokio::test]
    async fn rejects_oversized_fields_and_invalid_capacity() {
        let invalid = ProcessTransportConfig {
            read_capacity: 0,
            ..ProcessTransportConfig::default()
        };
        assert_eq!(
            ProcessClient::connect(socket_path(), invalid)
                .await
                .unwrap_err()
                .kind(),
            ErrorKind::Rejected
        );

        let (client, _server, _path) = spawned().await;
        let oversized = Bytes::from(vec![0_u8; client.config.max_payload_bytes + 1]);
        assert_eq!(
            client.append(oversized).await.unwrap_err().kind(),
            ErrorKind::Rejected
        );
        let oversized_token = vec![0_u8; client.config.max_position_bytes + 1];
        assert_eq!(
            client.decode_position(&oversized_token).unwrap_err().kind(),
            ErrorKind::InvalidPosition
        );
    }

    #[tokio::test]
    async fn child_process_rejects_malformed_and_oversized_frames() {
        let (client, _server, path) = spawned().await;
        let config = client.config.clone();
        drop(client);

        let mut malformed = UnixStream::connect(&path).await.unwrap();
        malformed.write_all(&1_u32.to_be_bytes()).await.unwrap();
        let (response, _) = read_frame(&mut malformed, &config).await.unwrap();
        assert_eq!(
            decode_remote_error(response).unwrap_err().kind(),
            ErrorKind::Corrupt
        );
        drop(malformed);

        let mut oversized = UnixStream::connect(&path).await.unwrap();
        let length = u32::try_from(config.max_frame_bytes + 1).unwrap();
        oversized.write_all(&length.to_be_bytes()).await.unwrap();
        let (response, _) = read_frame(&mut oversized, &config).await.unwrap();
        assert_eq!(
            decode_remote_error(response).unwrap_err().kind(),
            ErrorKind::Rejected
        );
    }

    #[tokio::test]
    async fn versioned_frame_bytes_are_deterministic_and_timeout_is_bounded() {
        let config = ProcessTransportConfig {
            operation_timeout: Duration::from_millis(20),
            ..ProcessTransportConfig::default()
        };
        let (mut writer, mut reader) = UnixStream::pair().unwrap();
        let frame = Frame::new(KIND_APPEND, vec![0xaa, 0xbb]).unwrap();
        write_frame(&mut writer, &frame, &config).await.unwrap();
        let mut bytes = [0_u8; 8];
        reader.read_exact(&mut bytes).await.unwrap();
        assert_eq!(
            bytes,
            [0, 0, 0, 4, PROTOCOL_VERSION, KIND_APPEND, 0xaa, 0xbb]
        );

        assert_eq!(
            read_frame(&mut reader, &config).await.unwrap_err().kind(),
            ErrorKind::Unavailable
        );
        for kind in [
            ErrorKind::InvalidPosition,
            ErrorKind::StalePosition,
            ErrorKind::Conflict,
            ErrorKind::Rejected,
            ErrorKind::Ambiguous,
            ErrorKind::Unavailable,
            ErrorKind::Corrupt,
        ] {
            assert_eq!(decode_error_kind(encode_error_kind(kind)).unwrap(), kind);
        }
    }

    #[tokio::test]
    async fn compression_precedes_child_process_wire_framing() {
        let (client, _server, _path) = spawned().await;
        let measured = client.clone();
        let compressed = CompressionStream::new(client);
        let payload = Bytes::from(vec![b'x'; 16 * 1024]);
        compressed.append(payload.clone()).await.unwrap();
        let records = compressed
            .read(None)
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();
        assert_eq!(records[0].payload, payload);

        let measurement = measured.measurement();
        println!(
            "process-network-measurement source_bytes={} wire_bytes={} peak_queued_records={}",
            payload.len() * 2,
            measurement.wire_bytes,
            measurement.peak_queued_records
        );
        assert!(measurement.wire_bytes < (payload.len() * 2) as u64);
        assert_eq!(measurement.peak_queued_records, 1);
    }
}
