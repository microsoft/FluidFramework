//! Optional WebSocket listener with independently backpressured child streams.

use std::{collections::BTreeMap, fmt::Write as _, net::SocketAddr, sync::Arc};

use bytes::Bytes;
use futures_util::{SinkExt as _, StreamExt as _};
use rand_core::{OsRng, RngCore as _};
use sea_webtransport::websocket::{PATH, SUBPROTOCOL};
use tokio::{
    net::{TcpListener, TcpStream},
    sync::{Mutex, Semaphore, watch},
    task::JoinSet,
    time::{Instant, timeout, timeout_at},
};
use tokio_tungstenite::{
    WebSocketStream, accept_hdr_async_with_config,
    tungstenite::{
        Message,
        handshake::server::{Request, Response},
        http::{HeaderValue, StatusCode},
    },
};

use crate::{
    MeasurementHandle, SeaConnectionService, SeaServiceHost, ShutdownDisposition, ShutdownHandle,
    ShutdownMode, ShutdownOutcome, TransportConfig, WebTransportError,
    server::{Metrics, serve_sea_stream, transport_error},
    websocket_io,
};

/// One connection-scoped dispatcher and the independently owned child sockets.
struct Group {
    /// Shared Sea authority for all child streams.
    service: Arc<dyn SeaConnectionService>,
    /// Cancellation broadcast when the owning control connection ends.
    stop: watch::Sender<bool>,
    /// Bound on concurrent logical streams.
    streams: Arc<Semaphore>,
}

/// Listener state shared with bounded handshake and connection tasks.
struct State {
    /// Host creates a dispatcher only for an accepted control connection.
    host: Arc<dyn SeaServiceHost>,
    /// Live control connections indexed by unguessable association tokens.
    groups: Mutex<BTreeMap<String, Arc<Group>>>,
    /// Validated stream and lifecycle limits.
    config: TransportConfig,
    /// Exact backend-visible origins accepted during upgrade.
    origins: Vec<String>,
    /// Development-only opt-in for originless Node clients on loopback sockets.
    allow_originless_loopback: bool,
    /// Activity counters shared with the QUIC implementation.
    metrics: Arc<Metrics>,
}

/// Optional plain-HTTP WebSocket endpoint for use behind a trusted TLS proxy.
///
/// Each client owns a control connection and opens one socket per logical stream.
/// Origin checks are not client authentication; use only an authorized development
/// exposure or an authenticating host/proxy. TLS terminates outside this listener.
pub struct WebSocketServer {
    /// TCP listener, separate from the existing QUIC endpoint.
    listener: TcpListener,
    /// Connection registry and bounded configuration.
    state: Arc<State>,
    /// Shutdown request sender retained for handle creation.
    shutdown_request: watch::Sender<Option<ShutdownMode>>,
    /// Server-owned shutdown receiver.
    shutdown_receiver: watch::Receiver<Option<ShutdownMode>>,
    /// Whether new connections can still be accepted.
    accepting: watch::Sender<bool>,
}

impl WebSocketServer {
    /// Binds a WebSocket listener with explicit, nonempty origin allowlist.
    ///
    /// # Errors
    /// Returns an error for invalid bounds, empty origins, or TCP binding failure.
    pub async fn bind(
        address: SocketAddr,
        service: Arc<dyn SeaServiceHost>,
        config: TransportConfig,
        allowed_origins: Vec<String>,
    ) -> Result<Self, WebTransportError> {
        config.validate()?;
        if allowed_origins.is_empty()
            || allowed_origins
                .iter()
                .any(|origin| origin.is_empty() || origin == "*")
            || u32::try_from(config.max_streams_per_connection).is_err()
            || config
                .max_connections
                .checked_mul(config.max_streams_per_connection.saturating_add(1))
                .is_none()
        {
            return Err(WebTransportError::InvalidConfig);
        }
        let listener = TcpListener::bind(address).await.map_err(transport_error)?;
        let (shutdown_request, shutdown_receiver) = watch::channel(None);
        let (accepting, _) = watch::channel(true);
        Ok(Self {
            listener,
            state: Arc::new(State {
                host: service,
                groups: Mutex::new(BTreeMap::new()),
                config,
                origins: allowed_origins,
                allow_originless_loopback: false,
                metrics: Arc::default(),
            }),
            shutdown_request,
            shutdown_receiver,
            accepting,
        })
    }

    /// Permits missing Origin only for loopback peers on a loopback-bound listener.
    ///
    /// Intended for direct Node integration tests, not forwarded/public endpoints.
    /// A local proxy also appears as a loopback peer; this is not authentication.
    /// Present Origin headers must still match the allowlist, including `null`.
    ///
    /// # Errors
    /// Rejects non-loopback listeners or configuration after state has been shared.
    pub fn with_originless_loopback_clients(mut self) -> Result<Self, WebTransportError> {
        if !self.local_addr()?.ip().is_loopback() {
            return Err(WebTransportError::InvalidConfig);
        }
        Arc::get_mut(&mut self.state)
            .ok_or(WebTransportError::InvalidConfig)?
            .allow_originless_loopback = true;
        Ok(self)
    }

    /// Returns the bound TCP address.
    ///
    /// # Errors
    /// Returns an error when the listener cannot report its address.
    pub fn local_addr(&self) -> Result<SocketAddr, WebTransportError> {
        self.listener.local_addr().map_err(transport_error)
    }

    /// Returns a cloneable shutdown controller.
    #[must_use]
    pub fn shutdown_handle(&self) -> ShutdownHandle {
        ShutdownHandle {
            request: self.shutdown_request.clone(),
            accepting: self.accepting.subscribe(),
        }
    }

    /// Returns transport activity measurements.
    #[must_use]
    pub fn measurement_handle(&self) -> MeasurementHandle {
        MeasurementHandle(Arc::clone(&self.state.metrics))
    }

    /// Serves bounded handshakes, groups, and streams until explicit shutdown.
    ///
    /// # Errors
    /// Returns an error for a listener failure or unavailable shutdown channel.
    pub async fn serve_until_shutdown(mut self) -> Result<ShutdownOutcome, WebTransportError> {
        let (stop, _) = watch::channel(false);
        let mut tasks = JoinSet::new();
        let task_limit =
            self.state.config.max_connections * (self.state.config.max_streams_per_connection + 1);
        let mut listener_error = None;
        let mode = loop {
            tokio::select! {
                incoming = self.listener.accept(), if tasks.len() < task_limit => {
                    match incoming {
                        Ok((socket, _)) => {
                            let state = Arc::clone(&self.state);
                            let stopped = stop.subscribe();
                            tasks.spawn(async move { handle_socket(socket, state, stopped).await });
                        }
                        Err(error) => { listener_error = Some(error); break ShutdownMode::Immediate; }
                    }
                }
                _ = tasks.join_next(), if !tasks.is_empty() => {}
                changed = self.shutdown_receiver.changed() => {
                    changed.map_err(|_| WebTransportError::ShutdownUnavailable)?;
                    if let Some(mode) = *self.shutdown_receiver.borrow_and_update() { break mode; }
                }
            }
        };
        self.accepting.send_replace(false);
        drop(self.listener);
        let started = Instant::now();
        let owned_connections = self.state.groups.lock().await.len();
        let deadline = match mode {
            ShutdownMode::Immediate => started,
            ShutdownMode::Drain { timeout } => started + timeout,
        };
        let mut cancelled_connections = 0;
        while !tasks.is_empty() {
            if timeout_at(deadline, tasks.join_next()).await.is_err() {
                cancelled_connections = self.state.groups.lock().await.len();
                stop.send_replace(true);
                while tasks.join_next().await.is_some() {}
                break;
            }
        }
        if let Some(error) = listener_error {
            return Err(transport_error(error));
        }
        let flushed = match timeout_at(deadline, self.state.host.flush()).await {
            Ok(result) => {
                result?;
                true
            }
            Err(_) => false,
        };
        Ok(ShutdownOutcome {
            disposition: if cancelled_connections == 0 && flushed {
                ShutdownDisposition::Drained
            } else {
                ShutdownDisposition::Cancelled
            },
            owned_connections,
            cancelled_connections,
            elapsed: started.elapsed(),
        })
    }
}

/// Disables TCP coalescing and validates upgrades before routing control or child connections.
#[expect(
    clippy::result_large_err,
    reason = "tungstenite requires an HTTP response error in its upgrade callback"
)]
async fn handle_socket(
    socket: TcpStream,
    state: Arc<State>,
    mut stopped: watch::Receiver<bool>,
) -> Result<(), WebTransportError> {
    socket.set_nodelay(true).map_err(transport_error)?;
    let mut path = String::new();
    let originless_allowed = state.allow_originless_loopback
        && socket
            .peer_addr()
            .map_err(transport_error)?
            .ip()
            .is_loopback();
    let handshake = accept_hdr_async_with_config(
        socket,
        |request: &Request, mut response: Response| {
            let valid_origin = match request.headers().get("origin") {
                Some(value) => value
                    .to_str()
                    .is_ok_and(|origin| state.origins.iter().any(|allowed| allowed == origin)),
                None => originless_allowed,
            };
            let valid_protocol = request
                .headers()
                .get("sec-websocket-protocol")
                .and_then(|value| value.to_str().ok())
                .is_some_and(|protocols| {
                    protocols
                        .split(',')
                        .any(|protocol| protocol.trim() == SUBPROTOCOL)
                });
            if !valid_origin
                || !valid_protocol
                || request.uri().query().is_some()
                || !(request.uri().path() == PATH
                    || request.uri().path().starts_with(&format!("{PATH}/")))
            {
                let mut rejection = tokio_tungstenite::tungstenite::http::Response::new(Some(
                    "WebSocket upgrade rejected".to_owned(),
                ));
                *rejection.status_mut() = StatusCode::FORBIDDEN;
                return Err(rejection);
            }
            request.uri().path().clone_into(&mut path);
            response.headers_mut().insert(
                "sec-websocket-protocol",
                HeaderValue::from_static(SUBPROTOCOL),
            );
            Ok(response)
        },
        Some(websocket_io::socket_config()),
    );
    let socket = tokio::select! {
        result = timeout(state.config.operation_timeout, handshake) => result.map_err(|_| WebTransportError::Timeout)?.map_err(transport_error)?,
        _ = stopped.changed() => return Ok(()),
    };
    if path == PATH {
        serve_group(socket, state, stopped).await
    } else {
        let token = path
            .strip_prefix(&format!("{PATH}/"))
            .ok_or(WebTransportError::Disconnected)?;
        let group = state
            .groups
            .lock()
            .await
            .get(token)
            .cloned()
            .ok_or(WebTransportError::Disconnected)?;
        let _permit = Arc::clone(&group.streams)
            .try_acquire_owned()
            .map_err(transport_error)?;
        let mut group_stop = group.stop.subscribe();
        if *group_stop.borrow() || *stopped.borrow() {
            return Ok(());
        }
        let _active = state.metrics.enter_stream();
        let (send, receive) = websocket_io::split(socket);
        let result = tokio::select! {
            result = serve_sea_stream(send, receive, Arc::clone(&group.service), &state.config, &state.metrics) => result,
            _ = group_stop.changed() => Ok(()),
            _ = stopped.changed() => Ok(()),
        };
        if matches!(result, Err(WebTransportError::SeaProtocol(_))) {
            group.stop.send_replace(true);
        }
        result
    }
}

/// Owns group lifetime, heartbeat traffic, and exactly one dispatcher cleanup.
async fn serve_group(
    mut socket: WebSocketStream<TcpStream>,
    state: Arc<State>,
    mut stopped: watch::Receiver<bool>,
) -> Result<(), WebTransportError> {
    let mut random = [0; 32];
    OsRng.try_fill_bytes(&mut random).map_err(transport_error)?;
    let mut token = String::with_capacity(64);
    for byte in random {
        write!(&mut token, "{byte:02x}").map_err(transport_error)?;
    }
    let group = {
        let mut groups = state.groups.lock().await;
        if groups.len() >= state.config.max_connections || *stopped.borrow() {
            return Err(WebTransportError::Disconnected);
        }
        let group = Arc::new(Group {
            service: state.host.connect(state.config.liveness),
            stop: watch::channel(false).0,
            streams: Arc::new(Semaphore::new(state.config.max_streams_per_connection)),
        });
        groups.insert(token.clone(), Arc::clone(&group));
        group
    };
    let _active = state.metrics.enter_connection();
    let mut group_stop = group.stop.subscribe();
    let result = async {
        timeout(state.config.operation_timeout, socket.send(Message::Text(token.clone().into()))).await.map_err(|_| WebTransportError::Timeout)?.map_err(transport_error)?;
        let mut heartbeat = tokio::time::interval(state.config.liveness.heartbeat_interval);
        heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        let mut last_response = Instant::now();
        loop {
            tokio::select! {
                message = socket.next() => match message {
                    Some(Ok(Message::Pong(_))) => last_response = Instant::now(),
                    Some(Ok(Message::Ping(bytes))) => {
                        timeout(state.config.operation_timeout, socket.send(Message::Pong(bytes))).await.map_err(|_| WebTransportError::Timeout)?.map_err(transport_error)?;
                        last_response = Instant::now();
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(error)) => return Err(transport_error(error)),
                    _ => return Err(transport_error("unexpected control message")),
                },
                _ = heartbeat.tick() => {
                    if last_response.elapsed() >= state.config.liveness.inactivity_timeout { return Err(WebTransportError::Timeout); }
                    timeout(state.config.operation_timeout, socket.send(Message::Ping(Bytes::new()))).await.map_err(|_| WebTransportError::Timeout)?.map_err(transport_error)?;
                }
                _ = stopped.changed() => break,
                _ = group_stop.changed() => break,
            }
        }
        Ok(())
    }.await;
    state.groups.lock().await.remove(&token);
    let reconnect_allowed = !*stopped.borrow() && !*group.stop.borrow();
    group.stop.send_replace(true);
    let _all_streams = Arc::clone(&group.streams)
        .acquire_many_owned(
            u32::try_from(state.config.max_streams_per_connection).map_err(transport_error)?,
        )
        .await
        .map_err(transport_error)?;
    group.service.connection_closed(reconnect_allowed).await;
    state.metrics.record_connection_cleanup();
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{BuiltInSeaHost, StorageMode};
    use tokio::time::Duration;
    use tokio_tungstenite::{
        MaybeTlsStream, connect_async, tungstenite::client::IntoClientRequest as _,
    };

    const ORIGIN: &str = "http://localhost:12345";

    #[tokio::test]
    async fn accepted_sockets_disable_nagle_before_upgrade() {
        let server = WebSocketServer::bind(
            "127.0.0.1:0".parse().unwrap(),
            Arc::new(BuiltInSeaHost::new(
                std::path::PathBuf::new(),
                StorageMode::Memory,
            )),
            TransportConfig::default(),
            vec![ORIGIN.to_owned()],
        )
        .await
        .unwrap();
        let _peer = TcpStream::connect(server.local_addr().unwrap())
            .await
            .unwrap();
        let (socket, _) = server.listener.accept().await.unwrap();
        let socket = socket.into_std().unwrap();
        socket.set_nodelay(false).unwrap();
        let inspection = socket.try_clone().unwrap();
        let (stop, stopped) = watch::channel(false);
        let handling = handle_socket(
            TcpStream::from_std(socket).unwrap(),
            Arc::clone(&server.state),
            stopped,
        );
        tokio::pin!(handling);
        assert!(futures_util::poll!(&mut handling).is_pending());
        assert!(inspection.nodelay().unwrap());
        stop.send_replace(true);
        handling.await.unwrap();
    }

    #[tokio::test]
    async fn originless_clients_require_explicit_loopback_opt_in() {
        for allowed in [false, true] {
            let server = WebSocketServer::bind(
                "127.0.0.1:0".parse().unwrap(),
                Arc::new(BuiltInSeaHost::new(
                    std::path::PathBuf::new(),
                    StorageMode::Memory,
                )),
                TransportConfig::default(),
                vec![ORIGIN.to_owned()],
            )
            .await
            .unwrap();
            let server = if allowed {
                server.with_originless_loopback_clients().unwrap()
            } else {
                server
            };
            let address = server.local_addr().unwrap();
            let shutdown = server.shutdown_handle();
            let serving = tokio::spawn(server.serve_until_shutdown());
            for origin in [None, Some("null"), Some("http://untrusted.invalid")] {
                let mut request = format!("ws://{address}{PATH}")
                    .into_client_request()
                    .unwrap();
                request.headers_mut().insert(
                    "sec-websocket-protocol",
                    HeaderValue::from_static(SUBPROTOCOL),
                );
                if let Some(origin) = origin {
                    request
                        .headers_mut()
                        .insert("origin", HeaderValue::from_static(origin));
                }
                let result = connect_async(request).await;
                assert_eq!(result.is_ok(), allowed && origin.is_none());
                drop(result);
            }
            shutdown.shutdown(ShutdownMode::Immediate).unwrap();
            timeout(Duration::from_secs(2), serving)
                .await
                .unwrap()
                .unwrap()
                .unwrap();
        }
        let server = WebSocketServer::bind(
            "0.0.0.0:0".parse().unwrap(),
            Arc::new(BuiltInSeaHost::new(
                std::path::PathBuf::new(),
                StorageMode::Memory,
            )),
            TransportConfig::default(),
            vec![ORIGIN.to_owned()],
        )
        .await
        .unwrap();
        assert!(server.with_originless_loopback_clients().is_err());
    }
    type ClientSocket = WebSocketStream<MaybeTlsStream<TcpStream>>;

    async fn connect(address: SocketAddr, path: &str) -> ClientSocket {
        let mut request = format!("ws://{address}{path}")
            .into_client_request()
            .unwrap();
        request
            .headers_mut()
            .insert("origin", HeaderValue::from_static(ORIGIN));
        request.headers_mut().insert(
            "sec-websocket-protocol",
            HeaderValue::from_static(SUBPROTOCOL),
        );
        timeout(Duration::from_secs(2), connect_async(request))
            .await
            .unwrap()
            .unwrap()
            .0
    }

    async fn token(socket: &mut ClientSocket) -> String {
        let message = timeout(Duration::from_secs(2), socket.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let Message::Text(token) = message else {
            panic!("expected group token")
        };
        assert_eq!(token.len(), 64);
        token.to_string()
    }

    async fn closed(socket: &mut ClientSocket) {
        timeout(Duration::from_secs(2), async {
            loop {
                match socket.next().await {
                    None | Some(Err(_) | Ok(Message::Close(_))) => break,
                    Some(Ok(Message::Ping(_) | Message::Pong(_))) => {}
                    _ => panic!("unexpected application message"),
                }
            }
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn owner_loss_revokes_children_and_token_and_shutdown_cleans_once() {
        let server = WebSocketServer::bind(
            "127.0.0.1:0".parse().unwrap(),
            Arc::new(BuiltInSeaHost::new(
                std::path::PathBuf::new(),
                StorageMode::Memory,
            )),
            TransportConfig::default(),
            vec![ORIGIN.to_owned()],
        )
        .await
        .unwrap();
        let address = server.local_addr().unwrap();
        let state = Arc::clone(&server.state);
        let shutdown = server.shutdown_handle();
        let measurements = server.measurement_handle();
        let serving = tokio::spawn(server.serve_until_shutdown());
        let mut owner = connect(address, PATH).await;
        let token = token(&mut owner).await;
        let group = state.groups.lock().await.get(&token).unwrap().clone();
        let child_path = format!("{PATH}/{token}");
        let mut child = connect(address, &child_path).await;
        drop(owner);
        closed(&mut child).await;
        timeout(Duration::from_secs(2), async {
            while measurements.snapshot().connection_cleanups != 1 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert!(state.groups.lock().await.is_empty());
        closed(&mut connect(address, &child_path).await).await;
        let mut replacement = connect(address, PATH).await;
        assert_ne!(self::token(&mut replacement).await, token);
        shutdown.shutdown(ShutdownMode::Immediate).unwrap();
        timeout(Duration::from_secs(2), serving)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        closed(&mut replacement).await;
        let final_measurement = measurements.snapshot();
        assert_eq!(final_measurement.connection_cleanups, 2);
        assert_eq!(final_measurement.active_connections, 0);
        assert_eq!(
            group.streams.available_permits(),
            state.config.max_streams_per_connection
        );
        assert!(state.groups.lock().await.is_empty());
    }

    #[tokio::test]
    async fn admission_checks_origins_protocol_groups_and_streams() {
        let config = TransportConfig {
            max_connections: 2,
            max_streams_per_connection: 1,
            ..TransportConfig::default()
        };
        let server = WebSocketServer::bind(
            "127.0.0.1:0".parse().unwrap(),
            Arc::new(BuiltInSeaHost::new(
                std::path::PathBuf::new(),
                StorageMode::Memory,
            )),
            config,
            vec![ORIGIN.to_owned()],
        )
        .await
        .unwrap();
        let address = server.local_addr().unwrap();
        let shutdown = server.shutdown_handle();
        let measurements = server.measurement_handle();
        let serving = tokio::spawn(server.serve_until_shutdown());
        for (origin, protocol, path) in [
            ("http://other.invalid", SUBPROTOCOL, PATH),
            (ORIGIN, "other", PATH),
            (ORIGIN, SUBPROTOCOL, "/other"),
            (ORIGIN, SUBPROTOCOL, "/sea/websocket?token=invalid"),
        ] {
            let mut request = format!("ws://{address}{path}")
                .into_client_request()
                .unwrap();
            request
                .headers_mut()
                .insert("origin", HeaderValue::from_str(origin).unwrap());
            request.headers_mut().insert(
                "sec-websocket-protocol",
                HeaderValue::from_str(protocol).unwrap(),
            );
            assert!(connect_async(request).await.is_err());
        }
        assert_eq!(measurements.snapshot().active_connections, 0);
        let mut first = connect(address, PATH).await;
        let first_token = token(&mut first).await;
        let mut second = connect(address, PATH).await;
        token(&mut second).await;
        closed(&mut connect(address, PATH).await).await;
        let child_path = format!("{PATH}/{first_token}");
        let child = connect(address, &child_path).await;
        closed(&mut connect(address, &child_path).await).await;
        assert_eq!(measurements.snapshot().peak_active_streams, 1);
        drop(child);
        drop(first);
        drop(second);
        shutdown
            .shutdown(ShutdownMode::Drain {
                timeout: Duration::from_secs(1),
            })
            .unwrap();
        timeout(Duration::from_secs(2), serving)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(measurements.snapshot().connection_cleanups, 2);
        assert_eq!(measurements.snapshot().active_connections, 0);
    }
}
