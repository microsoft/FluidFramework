#![doc = "Native HTTP/3 WebTransport adapter for FSP4 service frames."]

use std::{
    net::SocketAddr,
    sync::{
        Arc,
        atomic::{AtomicU64, AtomicUsize, Ordering},
    },
    time::Duration,
};

use bytes::Bytes;
use fluid_native_service::NativeService;
use fluid_service_protocol::{
    ErrorCode, Frame, HEADER_BYTES, Limits, Message, ProtocolError, Request, Response, decode,
    encode,
};
use thiserror::Error;
use tokio::time::timeout;
use wtransport::{
    ClientConfig, Connection, Endpoint, Identity, ServerConfig, VarInt,
    endpoint::endpoint_side::{Client, Server as ServerSide},
    tls::Sha256Digest,
};

const CLOSE_CODE: VarInt = VarInt::from_u32(1);

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct TransportMeasurement {
    pub wire_bytes: u64,
    pub peak_active_streams: usize,
}

#[derive(Debug, Default)]
struct Metrics {
    wire_bytes: AtomicU64,
    active_streams: AtomicUsize,
    peak_active_streams: AtomicUsize,
}

#[derive(Clone, Debug)]
pub struct MeasurementHandle(Arc<Metrics>);

impl MeasurementHandle {
    #[must_use]
    pub fn snapshot(&self) -> TransportMeasurement {
        self.0.snapshot()
    }
}

impl Metrics {
    fn add_wire_bytes(&self, count: usize) {
        self.wire_bytes.fetch_add(count as u64, Ordering::Relaxed);
    }

    fn enter_stream(&self) -> ActiveStream<'_> {
        let active = self.active_streams.fetch_add(1, Ordering::Relaxed) + 1;
        self.peak_active_streams
            .fetch_max(active, Ordering::Relaxed);
        ActiveStream(self)
    }

    fn snapshot(&self) -> TransportMeasurement {
        TransportMeasurement {
            wire_bytes: self.wire_bytes.load(Ordering::Relaxed),
            peak_active_streams: self.peak_active_streams.load(Ordering::Relaxed),
        }
    }
}

struct ActiveStream<'a>(&'a Metrics);

impl Drop for ActiveStream<'_> {
    fn drop(&mut self) {
        self.0.active_streams.fetch_sub(1, Ordering::Relaxed);
    }
}

#[derive(Clone, Debug)]
pub struct TransportConfig {
    pub limits: Limits,
    pub max_connections: usize,
    pub max_streams_per_connection: usize,
    pub operation_timeout: Duration,
}

impl Default for TransportConfig {
    fn default() -> Self {
        Self {
            limits: Limits::default(),
            max_connections: 16,
            max_streams_per_connection: 16,
            operation_timeout: Duration::from_secs(5),
        }
    }
}

impl TransportConfig {
    fn validate(&self) -> Result<(), WebTransportError> {
        if self.max_connections == 0 || self.max_streams_per_connection == 0 {
            return Err(WebTransportError::InvalidConfig);
        }
        if self.limits.max_frame_bytes < HEADER_BYTES {
            return Err(WebTransportError::InvalidConfig);
        }
        Ok(())
    }
}

#[derive(Debug, Error)]
pub enum WebTransportError {
    #[error("transport configuration is invalid")]
    InvalidConfig,
    #[error("transport operation timed out")]
    Timeout,
    #[error("transport disconnected")]
    Disconnected,
    #[error("transport failed: {0}")]
    Transport(String),
    #[error("protocol frame failed validation: {0}")]
    Protocol(#[from] ProtocolError),
    #[error("received a request where a response was required")]
    UnexpectedRequest,
}

pub struct WebTransportServer {
    endpoint: Endpoint<ServerSide>,
    service: Arc<NativeService>,
    config: TransportConfig,
    metrics: Arc<Metrics>,
}

impl WebTransportServer {
    /// Creates a native HTTP/3 endpoint bound to `address`.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid limits or when the UDP endpoint cannot be bound.
    pub fn bind(
        address: SocketAddr,
        identity: Identity,
        service: Arc<NativeService>,
        config: TransportConfig,
    ) -> Result<Self, WebTransportError> {
        config.validate()?;
        let endpoint = Endpoint::server(
            ServerConfig::builder()
                .with_bind_address(address)
                .with_identity(identity)
                .keep_alive_interval(Some(Duration::from_secs(3)))
                .build(),
        )
        .map_err(transport_error)?;
        Ok(Self {
            endpoint,
            service,
            config,
            metrics: Arc::new(Metrics::default()),
        })
    }

    /// Returns the UDP address selected by the operating system.
    ///
    /// # Errors
    ///
    /// Returns an error when the endpoint cannot report its local address.
    pub fn local_addr(&self) -> Result<SocketAddr, WebTransportError> {
        self.endpoint.local_addr().map_err(transport_error)
    }

    #[must_use]
    pub fn measurement(&self) -> TransportMeasurement {
        self.metrics.snapshot()
    }

    #[must_use]
    pub fn measurement_handle(&self) -> MeasurementHandle {
        MeasurementHandle(Arc::clone(&self.metrics))
    }

    /// Serves accepted WebTransport sessions until the endpoint is closed.
    ///
    /// # Errors
    ///
    /// Returns an error when the endpoint is closed while waiting for a session.
    pub async fn serve(self) -> Result<(), WebTransportError> {
        loop {
            let incoming = self.endpoint.accept().await;
            let Ok(request) = incoming.await else {
                continue;
            };
            if request.path() != "/fluid" {
                request.forbidden().await;
                continue;
            }
            let Ok(connection) = request.accept().await else {
                continue;
            };
            serve_connection(
                connection,
                Arc::clone(&self.service),
                self.config.clone(),
                Arc::clone(&self.metrics),
            )
            .await;
        }
    }
}

async fn serve_connection(
    connection: Connection,
    service: Arc<NativeService>,
    config: TransportConfig,
    metrics: Arc<Metrics>,
) {
    loop {
        let Ok((send, receive)) = connection.accept_bi().await else {
            return;
        };
        let _active = metrics.enter_stream();
        let _ = serve_stream(send, receive, &service, &config, &metrics).await;
    }
}

async fn serve_stream(
    mut send: wtransport::SendStream,
    mut receive: wtransport::RecvStream,
    service: &NativeService,
    config: &TransportConfig,
    metrics: &Metrics,
) -> Result<(), WebTransportError> {
    let request_bytes = read_frame(&mut receive, &config.limits, config.operation_timeout).await?;
    metrics.add_wire_bytes(request_bytes.len());
    let decoded = decode(&request_bytes, config.limits);
    let response = match decoded {
        Ok(Frame {
            request_id,
            message: Message::Request(request),
        }) => Frame {
            request_id,
            message: Message::Response(service.handle(request).await),
        },
        Ok(Frame { request_id, .. }) => Frame {
            request_id,
            message: Message::Response(Response::Error(ErrorCode::InvalidRequest)),
        },
        Err(error) => Frame {
            request_id: request_id_from_header(&request_bytes).unwrap_or(0),
            message: Message::Response(Response::Error(protocol_error_code(error))),
        },
    };
    let response_bytes = encode(&response, config.limits)?;
    write_frame(&mut send, &response_bytes, config.operation_timeout).await?;
    metrics.add_wire_bytes(response_bytes.len());
    Ok(())
}

pub struct WebTransportClient {
    endpoint: Endpoint<Client>,
    connection: Connection,
    url: String,
    certificate_hash: Sha256Digest,
    config: TransportConfig,
    request_id: AtomicU64,
    metrics: Arc<Metrics>,
}

impl WebTransportClient {
    /// Connects once using the supplied SHA-256 certificate pin.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid limits, connection failure, or timeout.
    pub async fn connect(
        url: impl Into<String>,
        certificate_hash: Sha256Digest,
        config: TransportConfig,
    ) -> Result<Self, WebTransportError> {
        config.validate()?;
        let url = url.into();
        let (endpoint, connection) =
            connect_once(&url, certificate_hash.clone(), config.operation_timeout).await?;
        Ok(Self {
            endpoint,
            connection,
            url,
            certificate_hash,
            config,
            request_id: AtomicU64::new(1),
            metrics: Arc::new(Metrics::default()),
        })
    }

    /// Replaces the current connection with a newly established session.
    ///
    /// # Errors
    ///
    /// Returns an error when the explicit connection attempt fails or times out.
    pub async fn reconnect(&mut self) -> Result<(), WebTransportError> {
        let (endpoint, connection) = connect_once(
            &self.url,
            self.certificate_hash.clone(),
            self.config.operation_timeout,
        )
        .await?;
        self.endpoint = endpoint;
        self.connection = connection;
        Ok(())
    }

    pub fn disconnect(&self) {
        self.connection.close(CLOSE_CODE, b"explicit disconnect");
    }

    /// Sends one FSP4 request on a fresh reliable bidirectional stream.
    ///
    /// # Errors
    ///
    /// Returns an error for transport failure, timeout, or invalid FSP4 bytes.
    pub async fn request(&self, request: Request) -> Result<Response, WebTransportError> {
        let request_id = self.request_id.fetch_add(1, Ordering::Relaxed);
        let frame = Frame {
            request_id,
            message: Message::Request(request),
        };
        let request_bytes = encode(&frame, self.config.limits)?;
        let (mut send, mut receive) = timeout(self.config.operation_timeout, async {
            self.connection
                .open_bi()
                .await
                .map_err(transport_error)?
                .await
                .map_err(transport_error)
        })
        .await
        .map_err(|_| WebTransportError::Timeout)??;
        write_frame(&mut send, &request_bytes, self.config.operation_timeout).await?;
        self.metrics.add_wire_bytes(request_bytes.len());
        let response_bytes = read_frame(
            &mut receive,
            &self.config.limits,
            self.config.operation_timeout,
        )
        .await?;
        self.metrics.add_wire_bytes(response_bytes.len());
        let response = decode(&response_bytes, self.config.limits)?;
        if response.request_id != request_id {
            return Err(WebTransportError::Disconnected);
        }
        match response.message {
            Message::Response(response) => Ok(response),
            Message::Request(_) => Err(WebTransportError::UnexpectedRequest),
        }
    }

    #[must_use]
    pub fn measurement(&self) -> TransportMeasurement {
        self.metrics.snapshot()
    }
}

async fn connect_once(
    url: &str,
    certificate_hash: Sha256Digest,
    operation_timeout: Duration,
) -> Result<(Endpoint<Client>, Connection), WebTransportError> {
    let endpoint = Endpoint::client(
        ClientConfig::builder()
            .with_bind_default()
            .with_server_certificate_hashes([certificate_hash])
            .build(),
    )
    .map_err(transport_error)?;
    let connection = timeout(operation_timeout, endpoint.connect(url))
        .await
        .map_err(|_| WebTransportError::Timeout)?
        .map_err(transport_error)?;
    Ok((endpoint, connection))
}

async fn write_frame(
    send: &mut wtransport::SendStream,
    bytes: &[u8],
    operation_timeout: Duration,
) -> Result<(), WebTransportError> {
    timeout(operation_timeout, async {
        send.write_all(bytes).await.map_err(transport_error)?;
        send.finish().await.map_err(transport_error)
    })
    .await
    .map_err(|_| WebTransportError::Timeout)?
}

async fn read_frame(
    receive: &mut wtransport::RecvStream,
    limits: &Limits,
    operation_timeout: Duration,
) -> Result<Bytes, WebTransportError> {
    timeout(operation_timeout, async {
        let mut header = [0_u8; HEADER_BYTES];
        receive
            .read_exact(&mut header)
            .await
            .map_err(transport_error)?;
        let body_bytes = usize::try_from(u32::from_be_bytes(
            header[HEADER_BYTES - 4..]
                .try_into()
                .map_err(|_| WebTransportError::Disconnected)?,
        ))
        .map_err(|_| WebTransportError::Protocol(ProtocolError::FrameTooLarge))?;
        let frame_bytes = HEADER_BYTES
            .checked_add(body_bytes)
            .ok_or(WebTransportError::Protocol(ProtocolError::FrameTooLarge))?;
        if frame_bytes > limits.max_frame_bytes {
            return Err(WebTransportError::Protocol(ProtocolError::FrameTooLarge));
        }
        let mut bytes = Vec::with_capacity(frame_bytes);
        bytes.extend_from_slice(&header);
        bytes.resize(frame_bytes, 0);
        receive
            .read_exact(&mut bytes[HEADER_BYTES..])
            .await
            .map_err(transport_error)?;
        let mut trailing = [0_u8; 1];
        if receive
            .read(&mut trailing)
            .await
            .map_err(transport_error)?
            .is_some()
        {
            return Err(WebTransportError::Protocol(ProtocolError::TrailingBytes));
        }
        Ok(Bytes::from(bytes))
    })
    .await
    .map_err(|_| WebTransportError::Timeout)?
}

fn request_id_from_header(bytes: &[u8]) -> Option<u64> {
    bytes
        .get(8..16)
        .and_then(|value| value.try_into().ok())
        .map(u64::from_be_bytes)
}

fn protocol_error_code(error: ProtocolError) -> ErrorCode {
    match error {
        ProtocolError::FrameTooLarge | ProtocolError::FieldTooLarge => ErrorCode::FrameTooLarge,
        ProtocolError::UnsupportedVersion => ErrorCode::UnsupportedVersion,
        _ => ErrorCode::InvalidRequest,
    }
}

fn transport_error(error: impl std::fmt::Display) -> WebTransportError {
    WebTransportError::Transport(error.to_string())
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf, sync::atomic::AtomicU64, time::Instant};

    use fluid_native_service::ServiceConfig;
    use fluid_service_protocol::{Acknowledgement, Reference, Submission, SubmissionDisposition};

    use super::*;

    static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(1);

    struct TempDirectory(PathBuf);

    impl TempDirectory {
        fn new() -> Self {
            let value = NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "fluid-webtransport-native-{}-{value}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TempDirectory {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    fn bytes(value: &'static [u8]) -> Bytes {
        Bytes::from_static(value)
    }

    fn submission(sequence: u64, reference: Reference) -> Request {
        Request::Submit(Submission {
            document: bytes(b"document"),
            writer: bytes(b"writer"),
            session: bytes(b"session"),
            submission: Bytes::from(format!("submission-{sequence}")),
            local_sequence_number: sequence,
            reference,
            payload: Bytes::from(format!("payload-{sequence}")),
        })
    }

    #[allow(clippy::too_many_lines)]
    #[tokio::test(flavor = "current_thread")]
    async fn native_client_preserves_fsp4_and_requires_explicit_reconnect() {
        tokio::task::LocalSet::new()
            .run_until(async {
                let directory = TempDirectory::new();
                let identity = Identity::self_signed(["localhost", "127.0.0.1"]).unwrap();
                let certificate_hash = identity.certificate_chain().as_slice()[0].hash();
                let server = WebTransportServer::bind(
                    "127.0.0.1:0".parse().unwrap(),
                    identity,
                    Arc::new(NativeService::new(ServiceConfig::new(&directory.0))),
                    TransportConfig::default(),
                )
                .unwrap();
                let address = server.local_addr().unwrap();
                let server_metrics = server.measurement_handle();
                let server_task = tokio::task::spawn_local(server.serve());
                let mut client = WebTransportClient::connect(
                    format!("https://{address}/fluid"),
                    certificate_hash,
                    TransportConfig::default(),
                )
                .await
                .unwrap();

        assert_eq!(
            client
                .request(Request::Create {
                    document: bytes(b"document"),
                })
                .await
                .unwrap(),
            Response::Acknowledged(Acknowledgement::Created)
        );
        assert_eq!(
            client
                .request(Request::OpenSession {
                    document: bytes(b"document"),
                    writer: bytes(b"writer"),
                    session: bytes(b"session"),
                    reference: Reference::Initial,
                })
                .await
                .unwrap(),
            Response::Acknowledged(Acknowledgement::SessionOpened)
        );
        let first_position = match client
            .request(submission(1, Reference::Initial))
            .await
            .unwrap()
        {
            Response::Submitted {
                disposition: SubmissionDisposition::Accepted,
                position,
                ..
            } => position,
            response => panic!("unexpected submit response: {response:?}"),
        };
        assert!(matches!(
            client
                .request(submission(2, Reference::At(first_position.clone())))
                .await
                .unwrap(),
            Response::Submitted {
                disposition: SubmissionDisposition::Accepted,
                ..
            }
        ));
        assert!(matches!(
            client
                .request(Request::Read {
                    document: bytes(b"document"),
                    after: None,
                })
                .await
                .unwrap(),
            Response::Read { records } if !records.is_empty()
        ));
        assert_eq!(
            client
                .request(Request::Read {
                    document: bytes(b"document"),
                    after: Some(bytes(b"malformed-token")),
                })
                .await
                .unwrap(),
            Response::Error(ErrorCode::InvalidPosition)
        );
        assert_eq!(
            client
                .request(Request::PublishSnapshot {
                    document: bytes(b"document"),
                    includes_through: Reference::At(first_position.clone()),
                    expected_parent: None,
                    payload: bytes(b"snapshot"),
                })
                .await
                .unwrap(),
            Response::Acknowledged(Acknowledgement::SnapshotPublished)
        );
        assert!(matches!(
            client
                .request(Request::LatestSnapshot {
                    document: bytes(b"document"),
                })
                .await
                .unwrap(),
            Response::Snapshot(Some(snapshot)) if snapshot.payload == bytes(b"snapshot")
        ));

        client.disconnect();
        assert!(client
            .request(Request::LatestSnapshot {
                document: bytes(b"document"),
            })
            .await
            .is_err());
        let reconnect_started = Instant::now();
        client.reconnect().await.unwrap();
        let reconnect_milliseconds = reconnect_started.elapsed().as_millis();
        assert!(matches!(
            client
                .request(Request::Read {
                    document: bytes(b"document"),
                    after: Some(first_position),
                })
                .await
                .unwrap(),
            Response::Read { records } if !records.is_empty()
        ));
        let client_measurement = client.measurement();
        let server_measurement = server_metrics.snapshot();
        assert!(client_measurement.wire_bytes > 0);
        assert_eq!(server_measurement.peak_active_streams, 1);
        println!(
            "NATIVE_EVIDENCE wire_bytes={} peak_active_streams={} reconnect_milliseconds={reconnect_milliseconds}",
            client_measurement.wire_bytes, server_measurement.peak_active_streams
        );

                server_task.abort();
            })
            .await;
    }
}
