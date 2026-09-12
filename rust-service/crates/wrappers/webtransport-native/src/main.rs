use std::{env, net::SocketAddr, path::PathBuf, sync::Arc};

use fluid_native_service::{NativeService, ServiceConfig};
use fluid_webtransport_native::{TransportConfig, WebTransportServer};
use wtransport::{Identity, tls::Sha256DigestFmt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut arguments = env::args().skip(1);
    let bind: SocketAddr = arguments
        .next()
        .ok_or("usage: fluid-webtransport-native <bind> <cert.pem> <key.pem> <data-dir>")?
        .parse()?;
    let certificate = PathBuf::from(arguments.next().ok_or("missing certificate path")?);
    let private_key = PathBuf::from(arguments.next().ok_or("missing private-key path")?);
    let data = PathBuf::from(arguments.next().ok_or("missing service data path")?);
    if arguments.next().is_some() {
        return Err("unexpected additional argument".into());
    }

    let identity = Identity::load_pemfiles(certificate, private_key).await?;
    let certificate_hash = identity.certificate_chain().as_slice()[0]
        .hash()
        .fmt(Sha256DigestFmt::DottedHex);
    let server = WebTransportServer::bind(
        bind,
        identity,
        Arc::new(NativeService::new(ServiceConfig::new(data))),
        TransportConfig::default(),
    )?;
    let address = server.local_addr()?;
    println!("WEBTRANSPORT_URL=https://{address}/fluid");
    println!("CERTIFICATE_SHA256={certificate_hash}");
    server.serve().await?;
    Ok(())
}
