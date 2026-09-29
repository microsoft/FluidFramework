use std::{
    env,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use sea_webtransport_server::{
    DocumentHost, LiveCacheRequired, PassThrough, ReaderShedding, SeaProtocolHost, SessionSetup,
    ShutdownMode, StorageSetup, TransportConfig, TransportMeasurement, WebTransportServer,
};
use wtransport::{Identity, tls::Sha256DigestFmt};

#[tokio::main]
#[expect(
    clippy::too_many_lines,
    reason = "Keep sequential server setup and the shutdown select together"
)]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut arguments = env::args().skip(1);
    let bind: SocketAddr = arguments
        .next()
        .ok_or("usage: sea-webtransport-server <bind> <cert.pem> <key.pem> <data-dir>")?
        .parse()?;
    let certificate = PathBuf::from(arguments.next().ok_or("missing certificate path")?);
    let private_key = PathBuf::from(arguments.next().ok_or("missing private-key path")?);
    let data = PathBuf::from(arguments.next().ok_or("missing service data path")?);
    let shutdown_marker = arguments.next().map(PathBuf::from);
    if arguments.next().is_some() {
        return Err("unexpected additional argument".into());
    }

    let identity = Identity::load_pemfiles(certificate, private_key).await?;
    let storage_mode = env::var("SEA_STORAGE_MODE").unwrap_or_else(|_| "durable-file".to_owned());
    let certificate_hash = identity.certificate_chain().as_slice()[0]
        .hash()
        .fmt(Sha256DigestFmt::DottedHex);
    let maximum_connections = match env::var("SEA_MAX_CONNECTIONS") {
        Ok(value) => Some(value),
        Err(env::VarError::NotPresent) => None,
        Err(error) => return Err(error.into()),
    };
    let author_window = match env::var("SEA_AUTHOR_WINDOW") {
        Ok(value) => Some(value),
        Err(env::VarError::NotPresent) => None,
        Err(error) => return Err(error.into()),
    };
    let transport_config =
        configured_transport(maximum_connections.as_deref(), author_window.as_deref())?;
    let live_cache = match env::var("SEA_EXPERIMENTAL_LIVE_CACHE") {
        Ok(value) => configured_live_cache(Some(&value))?,
        Err(env::VarError::NotPresent) => configured_live_cache(None)?,
        Err(error) => return Err(error.into()),
    };
    let session_factory = match env::var("SEA_EXPERIMENTAL_SESSION_FACTORY") {
        Ok(value) => configured_session_factory(Some(&value))?,
        Err(env::VarError::NotPresent) => configured_session_factory(None)?,
        Err(error) => return Err(error.into()),
    };
    let resource_policy = match env::var("SEA_EXPERIMENTAL_RESOURCE_POLICY") {
        Ok(value) => configured_resource_policy(Some(&value))?,
        Err(env::VarError::NotPresent) => configured_resource_policy(None)?,
        Err(error) => return Err(error.into()),
    };
    validate_session_modes(live_cache, session_factory, resource_policy)?;
    let host = Arc::new(configured_storage(
        &storage_mode,
        &data,
        live_cache,
        session_factory,
        resource_policy,
    )?);
    let server = WebTransportServer::bind(bind, identity, host.clone(), transport_config.clone())?;
    let address = server.local_addr()?;
    let liveness = server.liveness_policy();
    let measurements = server.measurement_handle();
    let mut shutdown_handles = vec![server.shutdown_handle()];
    #[cfg(feature = "websocket-stream")]
    let websocket_server = optional_websocket_server(
        host.clone(),
        &mut shutdown_handles,
        transport_config.clone(),
    )
    .await?;
    println!("WEBTRANSPORT_URL=https://{address}/sea");
    println!("CERTIFICATE_SHA256={certificate_hash}");
    println!("STORAGE_MODE={storage_mode}");
    if live_cache {
        println!("EXPERIMENTAL_LIVE_CACHE=true");
    }
    println!("EXPERIMENTAL_SESSION_FACTORY={session_factory}");
    println!("EXPERIMENTAL_RESOURCE_POLICY={resource_policy}");
    println!("PROTOCOL=sea");
    println!("MAX_CONNECTIONS={}", transport_config.max_connections);
    println!(
        "AUTHOR_WINDOW={}",
        transport_config.max_pending_author_requests
    );
    println!(
        "LIVENESS heartbeat_ms={} inactivity_ms={} reconnect_grace_ms={} max_event_lag={}",
        liveness.heartbeat_interval.as_millis(),
        liveness.inactivity_timeout.as_millis(),
        liveness.reconnect_grace.as_millis(),
        liveness.max_event_lag,
    );
    if let Some(marker) = &shutdown_marker {
        println!("SHUTDOWN_MARKER={}", marker.display());
    }

    let mut serving = Box::pin(async move {
        #[cfg(feature = "websocket-stream")]
        if let Some(websocket) = websocket_server {
            let websocket_measurements = websocket.measurement_handle();
            let (outcome, websocket_outcome) = tokio::try_join!(
                server.serve_until_shutdown(),
                websocket.serve_until_shutdown(),
            )?;
            print_shutdown_outcome(websocket_outcome, websocket_measurements.snapshot());
            return Ok::<_, sea_webtransport_server::WebTransportError>(outcome);
        }
        server.serve_until_shutdown().await
    });
    if let Some(marker) = shutdown_marker {
        tokio::select! {
            result = &mut serving => {
                result?;
            }
            () = wait_for_shutdown_marker(&marker) => {
                for shutdown in &shutdown_handles {
                    shutdown.shutdown(ShutdownMode::Drain {
                        timeout: Duration::from_secs(5),
                    })?;
                }
                let mut accepting_stopped = Box::pin(async {
                    for shutdown in &mut shutdown_handles {
                        shutdown.wait_stopped_accepting().await?;
                    }
                    Ok::<_, sea_webtransport_server::WebTransportError>(())
                });
                tokio::select! {
                    biased;
                    result = &mut accepting_stopped => result?,
                    result = &mut serving => {
                        let outcome = result?;
                        std::fs::write(marker.with_extension("ack"), b"accepting stopped\n")?;
                        print_shutdown_outcome(outcome, measurements.snapshot());
                        tokio::time::timeout(Duration::from_secs(5), host.shutdown()).await??;
                        return Ok(());
                    }
                }
                std::fs::write(marker.with_extension("ack"), b"accepting stopped\n")?;
                let outcome = serving.await?;
                print_shutdown_outcome(outcome, measurements.snapshot());
            }
        }
    } else {
        serving.await?;
    }
    tokio::time::timeout(Duration::from_secs(5), host.shutdown()).await??;
    Ok(())
}

/// Selects a storage recipe while preserving the executable's existing namespace layout.
fn configured_storage(
    mode: &str,
    data: &Path,
    live_cache: bool,
    pass_through: bool,
    resource_policy: bool,
) -> Result<SeaProtocolHost, Box<dyn std::error::Error>> {
    Ok(match mode {
        "memory" => configured_host(
            StorageSetup::memory(),
            live_cache,
            pass_through,
            resource_policy,
        )?,
        "buffered-file" => configured_host(
            StorageSetup::buffered(data.join("documents")),
            live_cache,
            pass_through,
            resource_policy,
        )?,
        "durable-file" => configured_host(
            StorageSetup::durable(data.join("documents")),
            live_cache,
            pass_through,
            resource_policy,
        )?,
        _ => {
            return Err(format!(
                "invalid SEA_STORAGE_MODE {mode:?}; expected memory, buffered-file, or durable-file"
            )
            .into());
        }
    })
}

/// Maps executable comparison flags to the same composable library setup used by embedded hosts.
fn configured_host<S: sea_core::storage::SeaStorage + 'static>(
    storage: StorageSetup<S>,
    live_cache: bool,
    pass_through: bool,
    resource_policy: bool,
) -> Result<SeaProtocolHost, LiveCacheRequired> {
    let sessions = SessionSetup::default().with_live_cache(live_cache);
    if resource_policy {
        DocumentHost::new(storage, sessions.decorate(ReaderShedding)).map(SeaProtocolHost::new)
    } else if pass_through {
        DocumentHost::new(storage, sessions.decorate(PassThrough)).map(SeaProtocolHost::new)
    } else {
        DocumentHost::new(storage, sessions).map(SeaProtocolHost::new)
    }
}

/// Binds the optional fallback only when both feature and runtime settings opt in.
#[cfg(feature = "websocket-stream")]
async fn optional_websocket_server(
    host: Arc<SeaProtocolHost>,
    shutdown_handles: &mut Vec<sea_webtransport_server::ShutdownHandle>,
    transport_config: TransportConfig,
) -> Result<Option<sea_webtransport_server::WebSocketServer>, Box<dyn std::error::Error>> {
    let Ok(bind) = env::var("SEA_WEBSOCKET_BIND") else {
        return Ok(None);
    };
    let origins = env::var("SEA_WEBSOCKET_ORIGINS")
        .map_err(|_| "SEA_WEBSOCKET_ORIGINS is required with SEA_WEBSOCKET_BIND")?
        .split(',')
        .map(|origin| origin.trim().to_owned())
        .collect();
    let websocket = sea_webtransport_server::WebSocketServer::bind(
        bind.parse()?,
        host,
        transport_config,
        origins,
    )
    .await?;
    let websocket = match env::var("SEA_WEBSOCKET_ORIGINLESS_LOOPBACK").as_deref() {
        Ok("1") => websocket.with_originless_loopback_clients()?,
        Ok("0") | Err(_) => websocket,
        Ok(_) => return Err("SEA_WEBSOCKET_ORIGINLESS_LOOPBACK must be 0 or 1".into()),
    };
    println!(
        "WEBSOCKET_URL=ws://{}/sea/websocket",
        websocket.local_addr()?
    );
    shutdown_handles.push(websocket.shutdown_handle());
    Ok(Some(websocket))
}

/// Applies a bounded per-listener connection override without changing other transport defaults.
fn configured_transport(
    maximum_connections: Option<&str>,
    author_window: Option<&str>,
) -> Result<TransportConfig, String> {
    let mut config = TransportConfig::default();
    for (value, target, name) in [
        (
            maximum_connections,
            &mut config.max_connections,
            "SEA_MAX_CONNECTIONS",
        ),
        (
            author_window,
            &mut config.max_pending_author_requests,
            "SEA_AUTHOR_WINDOW",
        ),
    ] {
        let Some(value) = value else { continue };
        let invalid = format!("{name} must be an integer from 1 through 4096");
        if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err(invalid);
        }
        let maximum = value.parse::<usize>().map_err(|_| invalid.clone())?;
        if !(1..=4096).contains(&maximum) {
            return Err(invalid);
        }
        *target = maximum;
    }
    Ok(config)
}

async fn wait_for_shutdown_marker(marker: &Path) {
    while !marker.exists() {
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    println!("SHUTDOWN_MARKER_DETECTED={}", marker.display());
}

fn print_shutdown_outcome(
    outcome: sea_webtransport_server::ShutdownOutcome,
    measurement: TransportMeasurement,
) {
    println!(
        "SHUTDOWN_EVIDENCE disposition={:?} owned_connections={} cancelled_connections={} elapsed_milliseconds={}",
        outcome.disposition,
        outcome.owned_connections,
        outcome.cancelled_connections,
        outcome.elapsed.as_millis()
    );
    println!(
        "TRANSPORT_EVIDENCE wire_bytes={} peak_connections={} peak_streams={} connection_cleanups={} active_connections={} peak_pending_author_requests={} peak_pending_author_bytes={}",
        measurement.wire_bytes,
        measurement.peak_active_connections,
        measurement.peak_active_streams,
        measurement.connection_cleanups,
        measurement.active_connections,
        measurement.peak_pending_author_requests,
        measurement.peak_pending_author_bytes,
    );
}

/// Defaults built-in recovery to the experimental cache while preserving a strict rollback switch.
fn configured_live_cache(value: Option<&str>) -> Result<bool, &'static str> {
    match value {
        Some("false") => Ok(false),
        None | Some("true") => Ok(true),
        Some(_) => Err("invalid SEA_EXPERIMENTAL_LIVE_CACHE; expected true or false"),
    }
}

/// Keeps interception opt-in and rejects malformed experimental settings.
fn configured_session_factory(value: Option<&str>) -> Result<bool, &'static str> {
    match value {
        None | Some("false") => Ok(false),
        Some("true") => Ok(true),
        Some(_) => Err("invalid SEA_EXPERIMENTAL_SESSION_FACTORY; expected true or false"),
    }
}

/// Enables bounded policy decoration by default with an explicit opt-out.
fn configured_resource_policy(value: Option<&str>) -> Result<bool, &'static str> {
    match value {
        Some("false") => Ok(false),
        None | Some("true") => Ok(true),
        Some(_) => Err("invalid SEA_EXPERIMENTAL_RESOURCE_POLICY; expected true or false"),
    }
}

fn validate_session_modes(
    live_cache: bool,
    session_factory: bool,
    resource_policy: bool,
) -> Result<(), &'static str> {
    if resource_policy && session_factory {
        return Err("resource policy and pass-through factory modes are mutually exclusive");
    }
    if resource_policy && !live_cache {
        return Err("resource policy requires live caching");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn storage_selection_preserves_modes_and_rejects_unknown_values() {
        let root = std::env::temp_dir().join(format!("sea-cli-storage-{}", std::process::id()));
        assert!(!root.exists());
        for mode in ["memory", "buffered-file", "durable-file"] {
            for (cache, pass, policy) in [
                (false, false, false),
                (true, true, false),
                (true, false, true),
            ] {
                assert!(super::configured_storage(mode, &root, cache, pass, policy).is_ok());
            }
            assert!(super::configured_storage(mode, &root, false, false, true).is_err());
        }
        let error = super::configured_storage("unknown", &root, true, false, false)
            .err()
            .unwrap();
        assert!(error.to_string().contains("invalid SEA_STORAGE_MODE"));
        assert!(!root.exists(), "configuration must not initialize storage");
    }

    #[test]
    fn resource_policy_is_default_on_with_explicit_off_and_strict_values() {
        assert_eq!(super::configured_resource_policy(None), Ok(true));
        assert_eq!(super::configured_resource_policy(Some("false")), Ok(false));
        assert_eq!(super::configured_resource_policy(Some("true")), Ok(true));
        for invalid in ["", "1", "TRUE", " true", "yes"] {
            assert!(super::configured_resource_policy(Some(invalid)).is_err());
        }
    }

    #[test]
    fn session_modes_require_explicit_policy_opt_out_for_incompatible_settings() {
        let cache = super::configured_live_cache(None).unwrap();
        let pass = super::configured_session_factory(None).unwrap();
        let policy = super::configured_resource_policy(None).unwrap();
        assert_eq!(super::validate_session_modes(cache, pass, policy), Ok(()));
        assert_eq!(
            super::validate_session_modes(false, pass, policy),
            Err("resource policy requires live caching")
        );
        assert_eq!(
            super::validate_session_modes(cache, true, policy),
            Err("resource policy and pass-through factory modes are mutually exclusive")
        );
        for cache in [false, true] {
            for pass in [false, true] {
                assert_eq!(super::validate_session_modes(cache, pass, false), Ok(()));
            }
        }
    }

    #[test]
    fn session_interception_is_opt_in_with_strict_values() {
        assert_eq!(super::configured_session_factory(None), Ok(false));
        assert_eq!(super::configured_session_factory(Some("false")), Ok(false));
        assert_eq!(super::configured_session_factory(Some("true")), Ok(true));
        for invalid in ["", "1", "TRUE", " true", "yes"] {
            assert!(super::configured_session_factory(Some(invalid)).is_err());
        }
    }
    #[test]
    fn activation_is_default_on_with_explicit_off_and_strict_values() {
        assert_eq!(super::configured_live_cache(None), Ok(true));
        assert_eq!(super::configured_live_cache(Some("false")), Ok(false));
        assert_eq!(super::configured_live_cache(Some("true")), Ok(true));
        for invalid in ["", "1", "TRUE", " true", "yes"] {
            assert!(super::configured_live_cache(Some(invalid)).is_err());
        }
    }
    use super::configured_transport;
    use sea_webtransport_server::TransportConfig;

    #[test]
    fn connection_override_preserves_defaults_and_rejects_invalid_limits() {
        let defaults = TransportConfig::default();
        assert_eq!(
            configured_transport(None, None).unwrap().max_connections,
            16
        );
        assert_eq!(
            configured_transport(None, None)
                .unwrap()
                .max_pending_author_requests,
            256
        );
        assert_eq!(defaults.max_frame_bytes, 4 * 1024 * 1024);
        for maximum in [1, 64, 128, 256, 4096] {
            let text = maximum.to_string();
            let config = configured_transport(Some(&text), None).unwrap();
            assert_eq!(config.max_connections, maximum);
            assert_eq!(config.max_frame_bytes, defaults.max_frame_bytes);
            assert_eq!(
                config.max_streams_per_connection,
                defaults.max_streams_per_connection
            );
            assert_eq!(config.operation_timeout, defaults.operation_timeout);
            let config = configured_transport(None, Some(&text)).unwrap();
            assert_eq!(config.max_pending_author_requests, maximum);
            assert_eq!(config.max_connections, defaults.max_connections);
        }
        for invalid in [
            "",
            "0",
            "4097",
            "-1",
            "+1",
            " 16",
            "1.5",
            "184467440737095516160",
        ] {
            assert!(
                configured_transport(Some(invalid), None).is_err(),
                "{invalid}"
            );
            assert!(
                configured_transport(None, Some(invalid)).is_err(),
                "{invalid}"
            );
        }
    }
}
