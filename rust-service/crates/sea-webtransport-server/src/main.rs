use std::{
    env,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use sea_webtransport_server::{
    BuiltInSeaHost, ShutdownMode, StorageMode, TransportConfig, TransportMeasurement,
    WebTransportServer,
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
    let storage_mode_name =
        env::var("SEA_STORAGE_MODE").unwrap_or_else(|_| StorageMode::DurableFile.name().to_owned());
    let storage_mode = StorageMode::from_name(&storage_mode_name).ok_or_else(|| {
        format!(
            "invalid SEA_STORAGE_MODE {storage_mode_name:?}; expected memory, buffered-file, or durable-file"
        )
    })?;
    let certificate_hash = identity.certificate_chain().as_slice()[0]
        .hash()
        .fmt(Sha256DigestFmt::DottedHex);
    let maximum_connections = match env::var("SEA_MAX_CONNECTIONS") {
        Ok(value) => Some(value),
        Err(env::VarError::NotPresent) => None,
        Err(error) => return Err(error.into()),
    };
    let transport_config = configured_transport(maximum_connections.as_deref())?;
    let live_cache = match env::var("SEA_EXPERIMENTAL_LIVE_CACHE") {
        Ok(value) => configured_live_cache(Some(&value))?,
        Err(env::VarError::NotPresent) => configured_live_cache(None)?,
        Err(error) => return Err(error.into()),
    };
    let host = Arc::new(BuiltInSeaHost::new_with_live_cache(
        data,
        storage_mode,
        live_cache,
    ));
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
    println!("STORAGE_MODE={}", storage_mode.name());
    if live_cache {
        println!("EXPERIMENTAL_LIVE_CACHE=true");
    }
    println!("PROTOCOL=sea");
    println!("MAX_CONNECTIONS={}", transport_config.max_connections);
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

/// Binds the optional fallback only when both feature and runtime settings opt in.
#[cfg(feature = "websocket-stream")]
async fn optional_websocket_server(
    host: Arc<BuiltInSeaHost>,
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
) -> Result<TransportConfig, &'static str> {
    let mut config = TransportConfig::default();
    if let Some(value) = maximum_connections {
        let invalid = "SEA_MAX_CONNECTIONS must be an integer from 1 through 4096";
        if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err(invalid);
        }
        let maximum = value.parse::<usize>().map_err(|_| invalid)?;
        if !(1..=4096).contains(&maximum) {
            return Err(invalid);
        }
        config.max_connections = maximum;
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
        "TRANSPORT_EVIDENCE wire_bytes={} peak_connections={} peak_streams={} connection_cleanups={} active_connections={}",
        measurement.wire_bytes,
        measurement.peak_active_connections,
        measurement.peak_active_streams,
        measurement.connection_cleanups,
        measurement.active_connections,
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

#[cfg(test)]
mod tests {
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
        assert_eq!(configured_transport(None).unwrap().max_connections, 16);
        for maximum in [1, 64, 4096] {
            let text = maximum.to_string();
            let config = configured_transport(Some(&text)).unwrap();
            assert_eq!(config.max_connections, maximum);
            assert_eq!(config.max_frame_bytes, defaults.max_frame_bytes);
            assert_eq!(
                config.max_streams_per_connection,
                defaults.max_streams_per_connection
            );
            assert_eq!(config.operation_timeout, defaults.operation_timeout);
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
            assert!(configured_transport(Some(invalid)).is_err(), "{invalid}");
        }
    }
}
