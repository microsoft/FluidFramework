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
    let host = Arc::new(BuiltInSeaHost::new(data, storage_mode));
    let server =
        WebTransportServer::bind(bind, identity, host.clone(), TransportConfig::default())?;
    let address = server.local_addr()?;
    let liveness = server.liveness_policy();
    let measurements = server.measurement_handle();
    let mut shutdown_handles = vec![server.shutdown_handle()];
    #[cfg(feature = "websocket-stream")]
    let websocket_server = optional_websocket_server(host, &mut shutdown_handles).await?;
    println!("WEBTRANSPORT_URL=https://{address}/sea");
    println!("CERTIFICATE_SHA256={certificate_hash}");
    println!("STORAGE_MODE={}", storage_mode.name());
    println!("PROTOCOL=sea");
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
    Ok(())
}

/// Binds the optional fallback only when both feature and runtime settings opt in.
#[cfg(feature = "websocket-stream")]
async fn optional_websocket_server(
    host: Arc<BuiltInSeaHost>,
    shutdown_handles: &mut Vec<sea_webtransport_server::ShutdownHandle>,
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
        TransportConfig::default(),
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
