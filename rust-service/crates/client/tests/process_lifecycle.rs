use std::{
    env, fs,
    io::{Read, Write},
    net::Shutdown,
    os::unix::net::{UnixListener, UnixStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

use bytes::Bytes;
use fluid_native_service::{NativeService, ServiceConfig};
use fluid_service_protocol::{
    Acknowledgement, Frame, Limits, Message, Reference, Request, Response, SubmissionDisposition,
    decode, encode,
};
use snapshotted_stream_client::{LifecycleEvent, LifecycleState, NativeClient};

const SERVER_SOCKET: &str = "FLUID_NATIVE_CLIENT_TEST_SOCKET";
const SERVER_ROOT: &str = "FLUID_NATIVE_CLIENT_TEST_ROOT";

struct TempDirectory(PathBuf);

impl TempDirectory {
    fn new() -> Self {
        let path = env::temp_dir().join(format!(
            "fluid-native-client-process-{}",
            std::process::id()
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
fn disconnect_boundaries_resolve_only_after_explicit_replay() {
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
    assert_eq!(client.recover_ambiguous().unwrap(), before_commit);
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
    assert_eq!(client.recover_ambiguous().unwrap(), after_commit);
    assert!(matches!(
        client
            .handle_response(exchange(&socket, after_commit))
            .unwrap(),
        LifecycleEvent::SubmissionAcknowledged(acknowledgement)
            if acknowledgement.disposition == SubmissionDisposition::Duplicate
    ));
    assert_eq!(client.state(), LifecycleState::Connected);
    assert!(client.pending().is_none());

    assert_eq!(
        exchange(&socket, Request::Shutdown),
        Response::Acknowledged(Acknowledgement::ShuttingDown)
    );
    assert!(child.wait().unwrap().success());
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
