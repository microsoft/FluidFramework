use std::{
    env, fs,
    io::{Read, Write},
    net::Shutdown,
    os::unix::net::{UnixListener, UnixStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant},
};

use bytes::Bytes;
use sea_service::{NativeService, ServiceConfig};
use sea_protocol::{
    Acknowledgement, Frame, Limits, Message, Reference, Request, Resolution, Response,
    SubmissionDisposition, SummaryEntry, decode, encode,
};
use sea_client::{ContentClient, LifecycleEvent, LifecycleState, NativeClient};

const SERVER_SOCKET: &str = "FLUID_NATIVE_CLIENT_TEST_SOCKET";
const SERVER_ROOT: &str = "FLUID_NATIVE_CLIENT_TEST_ROOT";
static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(1);

struct TempDirectory(PathBuf);

impl TempDirectory {
    fn new() -> Self {
        let sequence = NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed);
        let path = env::temp_dir().join(format!(
            "fluid-native-client-process-{}-{sequence}",
            std::process::id(),
        ));
        if path.exists() {
            fs::remove_dir_all(&path).unwrap();
        }
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for TempDirectory {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

#[test]
fn lifecycle_process_server() {
    let (Ok(socket), Ok(root)) = (env::var(SERVER_SOCKET), env::var(SERVER_ROOT)) else {
        return;
    };
    let socket = PathBuf::from(socket);
    if socket.exists() {
        fs::remove_file(&socket).unwrap();
    }
    let listener = UnixListener::bind(&socket).unwrap();
    let service = NativeService::new(ServiceConfig::new(root));
    let runtime = tokio::runtime::Runtime::new().unwrap();
    for incoming in listener.incoming() {
        let mut stream = incoming.unwrap();
        let request = read_request(&mut stream);
        let shutdown = matches!(request, Request::Shutdown);
        let response = runtime.block_on(service.handle(request));
        let _ = write_response(&mut stream, response);
        if shutdown {
            break;
        }
    }
    fs::remove_file(socket).unwrap();
}

#[test]
fn disconnect_boundaries_resolve_without_hidden_retry() {
    let directory = TempDirectory::new();
    let root = directory.0.join("data");
    let socket = directory.0.join("service.sock");
    let mut child = spawn_server(&root, &socket);
    assert_eq!(
        exchange(
            &socket,
            Request::Create {
                document: bytes(b"document"),
            },
        ),
        Response::Acknowledged(Acknowledgement::Created)
    );

    let mut client = NativeClient::new(bytes(b"document"), bytes(b"writer"));
    let connect = client
        .connect(bytes(b"session-1"), Reference::Initial)
        .unwrap();
    assert_eq!(
        client.handle_response(exchange(&socket, connect)).unwrap(),
        LifecycleEvent::Connected
    );

    let before_commit = client
        .submit(
            bytes(b"submission-1"),
            1,
            Reference::Initial,
            bytes(b"operation-1"),
        )
        .unwrap();
    client.disconnected();
    assert_eq!(client.state(), LifecycleState::Ambiguous);
    let before_resolution = recovery_request(&mut client);
    assert_eq!(
        client
            .handle_response(exchange(&socket, before_resolution))
            .unwrap(),
        LifecycleEvent::SubmissionNotCommitted
    );
    assert_eq!(client.retry_not_committed().unwrap(), before_commit);
    assert!(matches!(
        client
            .handle_response(exchange(&socket, before_commit))
            .unwrap(),
        LifecycleEvent::SubmissionAcknowledged(acknowledgement)
            if acknowledgement.disposition == SubmissionDisposition::Accepted
    ));

    let after_commit = client
        .submit(
            bytes(b"submission-2"),
            2,
            Reference::Initial,
            bytes(b"operation-2"),
        )
        .unwrap();
    send_without_reading(&socket, after_commit.clone());
    let Response::Read { records } = exchange(
        &socket,
        Request::Read {
            document: bytes(b"document"),
            after: None,
        },
    ) else {
        panic!("read must confirm the committed request");
    };
    assert_eq!(records.len(), 3);
    client.disconnected();
    child.kill().unwrap();
    child.wait().unwrap();

    child = spawn_server(&root, &socket);
    let after_resolution = recovery_request(&mut client);
    assert!(matches!(
        client
            .handle_response(exchange(&socket, after_resolution))
            .unwrap(),
        LifecycleEvent::SubmissionAcknowledged(acknowledgement)
            if acknowledgement.disposition == SubmissionDisposition::Duplicate
    ));
    assert_eq!(client.state(), LifecycleState::Connected);
    assert!(client.pending().is_none());

    assert!(matches!(
        exchange(
            &socket,
            Request::ResolveSubmission {
                document: bytes(b"document"),
                writer: bytes(b"writer"),
                session: bytes(b"session-1"),
                submission: bytes(b"submission-2"),
            }
        ),
        Response::Resolved(Resolution::Committed {
            sequence_number: 2,
            ..
        })
    ));

    assert_eq!(
        exchange(&socket, Request::Shutdown),
        Response::Acknowledged(Acknowledgement::ShuttingDown)
    );
    assert!(child.wait().unwrap().success());
}

#[test]
fn content_operations_survive_lost_acknowledgement_and_process_restart() {
    let directory = TempDirectory::new();
    let root = directory.0.join("data");
    let socket = directory.0.join("service.sock");
    let mut child = spawn_server(&root, &socket);

    let upload = ContentClient::upload_blob(bytes(b"durable blob"));
    let receipt = ContentClient::uploaded(exchange(&socket, upload.clone())).unwrap();
    assert_eq!(receipt.size_bytes, 12);
    assert!(!receipt.deduplicated);
    let duplicate = ContentClient::uploaded(exchange(&socket, upload)).unwrap();
    assert_eq!(duplicate.digest, receipt.digest);
    assert!(duplicate.deduplicated);

    let entries = vec![SummaryEntry {
        path: bytes(b"root/data"),
        blob: receipt.digest.clone(),
    }];
    let publish = ContentClient::publish_summary(entries.clone());
    send_without_reading(&socket, publish.clone());
    let publication = ContentClient::published(exchange(&socket, publish)).unwrap();
    assert!(publication.deduplicated);
    assert_eq!(publication.entry_count, 1);

    child.kill().unwrap();
    child.wait().unwrap();
    child = spawn_server(&root, &socket);

    let payload = ContentClient::blob(
        exchange(&socket, ContentClient::fetch_blob(receipt.digest.clone())),
        &receipt.digest,
    )
    .unwrap();
    assert_eq!(payload, bytes(b"durable blob"));
    let recovered_entries = ContentClient::summary(
        exchange(
            &socket,
            ContentClient::fetch_summary(publication.digest.clone()),
        ),
        &publication.digest,
    )
    .unwrap();
    assert_eq!(recovered_entries, entries);

    assert_eq!(
        exchange(&socket, Request::Shutdown),
        Response::Acknowledged(Acknowledgement::ShuttingDown)
    );
    assert!(child.wait().unwrap().success());
}

fn recovery_request(client: &mut NativeClient) -> Request {
    let request = client.recover_ambiguous().unwrap();
    assert!(matches!(request, Request::ResolveSubmission { .. }));
    request
}

fn spawn_server(root: &Path, socket: &Path) -> Child {
    if socket.exists() {
        fs::remove_file(socket).unwrap();
    }
    let child = Command::new(env::current_exe().unwrap())
        .args(["--exact", "lifecycle_process_server", "--nocapture"])
        .env(SERVER_ROOT, root)
        .env(SERVER_SOCKET, socket)
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap();
    let started = Instant::now();
    while !socket.exists() {
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "server startup timed out"
        );
        std::thread::yield_now();
    }
    child
}

fn exchange(socket: &Path, request: Request) -> Response {
    let mut stream = UnixStream::connect(socket).unwrap();
    write_request(&mut stream, request);
    let mut length = [0_u8; 4];
    stream.read_exact(&mut length).unwrap();
    let mut response = vec![0_u8; u32::from_be_bytes(length) as usize];
    stream.read_exact(&mut response).unwrap();
    match decode(&response, Limits::default()).unwrap().message {
        Message::Response(response) => response,
        message @ Message::Request(_) => panic!("unexpected service message: {message:?}"),
    }
}

fn send_without_reading(socket: &Path, request: Request) {
    let mut stream = UnixStream::connect(socket).unwrap();
    write_request(&mut stream, request);
    stream.shutdown(Shutdown::Both).unwrap();
}

fn write_request(stream: &mut UnixStream, request: Request) {
    let encoded = encode(
        &Frame {
            request_id: 1,
            message: Message::Request(request),
        },
        Limits::default(),
    )
    .unwrap();
    stream
        .write_all(&u32::try_from(encoded.len()).unwrap().to_be_bytes())
        .unwrap();
    stream.write_all(&encoded).unwrap();
}

fn read_request(stream: &mut UnixStream) -> Request {
    let mut length = [0_u8; 4];
    stream.read_exact(&mut length).unwrap();
    let mut request = vec![0_u8; u32::from_be_bytes(length) as usize];
    stream.read_exact(&mut request).unwrap();
    match decode(&request, Limits::default()).unwrap().message {
        Message::Request(request) => request,
        message @ Message::Response(_) => panic!("unexpected client message: {message:?}"),
    }
}

fn write_response(stream: &mut UnixStream, response: Response) -> std::io::Result<()> {
    let encoded = encode(
        &Frame {
            request_id: 1,
            message: Message::Response(response),
        },
        Limits::default(),
    )
    .unwrap();
    stream.write_all(&u32::try_from(encoded.len()).unwrap().to_be_bytes())?;
    stream.write_all(&encoded)
}

fn bytes(value: &'static [u8]) -> Bytes {
    Bytes::from_static(value)
}
