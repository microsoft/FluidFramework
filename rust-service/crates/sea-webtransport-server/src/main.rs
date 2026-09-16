use std::{
    env,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use sea_webtransport_server::{
    BuiltInSeaHost, ShutdownMode, StorageMode, TransportConfig, WebTransportServer,
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
    let server = WebTransportServer::bind(
        bind,
        identity,
        Arc::new(BuiltInSeaHost::new(data, storage_mode)),
        TransportConfig::default(),
    )?;
    let address = server.local_addr()?;
    let mut shutdown = server.shutdown_handle();
    println!("WEBTRANSPORT_URL=https://{address}/sea");
    println!("CERTIFICATE_SHA256={certificate_hash}");
    println!("STORAGE_MODE={}", storage_mode.name());
    println!("PROTOCOL=sea");
    if let Some(marker) = &shutdown_marker {
        println!("SHUTDOWN_MARKER={}", marker.display());
    }
    let mut serving = Box::pin(server.serve_until_shutdown());
    if let Some(marker) = shutdown_marker {
        tokio::select! {
            result = &mut serving => {
                result?;
            }
            () = wait_for_shutdown_marker(&marker) => {
                shutdown.shutdown(ShutdownMode::Drain {
                    timeout: Duration::from_secs(5),
                })?;
                let mut accepting_stopped = Box::pin(shutdown.wait_stopped_accepting());
                tokio::select! {
                    biased;
                    result = &mut accepting_stopped => result?,
                    result = &mut serving => {
                        let outcome = result?;
                        std::fs::write(marker.with_extension("ack"), b"accepting stopped\n")?;
                        print_shutdown_outcome(outcome);
                        return Ok(());
                    }
                }
                std::fs::write(marker.with_extension("ack"), b"accepting stopped\n")?;
                let outcome = serving.await?;
                print_shutdown_outcome(outcome);
            }
        }
    } else {
        serving.await?;
    }
    Ok(())
}

async fn wait_for_shutdown_marker(marker: &Path) {
    while !marker.exists() {
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    println!("SHUTDOWN_MARKER_DETECTED={}", marker.display());
}

fn print_shutdown_outcome(outcome: sea_webtransport_server::ShutdownOutcome) {
    println!(
        "SHUTDOWN_EVIDENCE disposition={:?} owned_connections={} cancelled_connections={} elapsed_milliseconds={}",
        outcome.disposition,
        outcome.owned_connections,
        outcome.cancelled_connections,
        outcome.elapsed.as_millis()
    );
}
