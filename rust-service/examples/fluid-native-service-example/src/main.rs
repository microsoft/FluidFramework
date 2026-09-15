use std::{env, error::Error, io, path::PathBuf, time::Duration};

use sea_service::{NativeService, ServiceConfig};
use sea_protocol::{
    ErrorCode, Frame, Limits, Message, Request, Response, decode, encode,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{UnixListener, UnixStream},
    time::timeout,
};

/// Maximum time allowed for one complete request/response exchange.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

/// Required data-root and Unix-socket paths for one service process.
struct Arguments {
    /// Root directory for document state.
    root: PathBuf,
    /// Unix-domain socket path owned by the process.
    socket: PathBuf,
}

/// Binds the socket and serves one bounded FSP4 request per connection.
#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let arguments = parse_arguments()?;
    if arguments.socket.exists() {
        std::fs::remove_file(&arguments.socket)?;
    }
    if let Some(parent) = arguments.socket.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let listener = UnixListener::bind(&arguments.socket)?;
    println!("READY {}", arguments.socket.display());
    let service = NativeService::new(ServiceConfig::new(arguments.root));

    loop {
        let (stream, _) = listener.accept().await?;
        let shutdown = timeout(
            REQUEST_TIMEOUT,
            serve_one(stream, &service, Limits::default()),
        )
        .await
        .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "request timed out"))??;
        if shutdown {
            break;
        }
    }
    std::fs::remove_file(&arguments.socket)?;
    Ok(())
}

/// Decodes, dispatches, and responds to one length-prefixed FSP4 frame.
async fn serve_one(
    mut stream: UnixStream,
    service: &NativeService,
    limits: Limits,
) -> Result<bool, io::Error> {
    let frame_length = usize::try_from(stream.read_u32().await?)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "frame length overflow"))?;
    if frame_length > limits.max_frame_bytes {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "frame exceeds configured limit",
        ));
    }
    let mut bytes = vec![0_u8; frame_length];
    stream.read_exact(&mut bytes).await?;
    let decoded = decode(&bytes, limits);
    let (request_id, request) = match decoded {
        Ok(Frame {
            request_id,
            message: Message::Request(request),
        }) => (request_id, Some(request)),
        Ok(Frame { request_id, .. }) => (request_id, None),
        Err(_) => (0, None),
    };
    let shutdown = matches!(request, Some(Request::Shutdown));
    let response = match request {
        Some(request) => service.handle(request).await,
        None => Response::Error(ErrorCode::InvalidRequest),
    };
    let encoded = encode(
        &Frame {
            request_id,
            message: Message::Response(response),
        },
        limits,
    )
    .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    stream
        .write_u32(u32::try_from(encoded.len()).map_err(|_| {
            io::Error::new(io::ErrorKind::InvalidData, "response frame length overflow")
        })?)
        .await?;
    stream.write_all(&encoded).await?;
    stream.shutdown().await?;
    Ok(shutdown)
}

/// Parses process arguments from the environment.
fn parse_arguments() -> Result<Arguments, Box<dyn Error>> {
    parse_arguments_from(env::args().skip(1))
}

/// Parses required paths from an injected argument sequence for testability.
fn parse_arguments_from(
    arguments: impl IntoIterator<Item = String>,
) -> Result<Arguments, Box<dyn Error>> {
    let mut root = None;
    let mut socket = None;
    let mut arguments = arguments.into_iter();
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--root" => {
                root = Some(PathBuf::from(
                    arguments.next().ok_or("missing value for --root")?,
                ));
            }
            "--socket" => {
                socket = Some(PathBuf::from(
                    arguments.next().ok_or("missing value for --socket")?,
                ));
            }
            _ => return Err(format!("unknown argument: {argument}").into()),
        }
    }
    Ok(Arguments {
        root: root.ok_or("--root is required")?,
        socket: socket.ok_or("--socket is required")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_required_paths() {
        let arguments =
            parse_arguments_from(["--root", "data", "--socket", "service.sock"].map(str::to_owned))
                .expect("valid paths should parse");

        assert_eq!(arguments.root, PathBuf::from("data"));
        assert_eq!(arguments.socket, PathBuf::from("service.sock"));
    }

    #[test]
    fn reports_missing_option_values() {
        for option in ["--root", "--socket"] {
            let error = parse_arguments_from([option.to_owned()])
                .err()
                .expect("missing value should fail");

            assert_eq!(error.to_string(), format!("missing value for {option}"));
        }
    }
}
