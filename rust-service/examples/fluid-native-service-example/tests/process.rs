use std::{
    fs,
    io::{Read, Write},
    os::unix::net::UnixStream,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant},
};

use bytes::Bytes;
use sea_protocol::{
    Acknowledgement, ErrorCode, Frame, Limits, Message, Reference, Request, Response, Submission,
    decode, encode,
};

static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(1);

struct TempDirectory(PathBuf);

impl TempDirectory {
    fn new() -> Self {
        let value = NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "fluid-native-service-process-{}-{value}",
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

fn spawn_server(root: &Path, socket: &Path) -> Child {
    if socket.exists() {
        fs::remove_file(socket).unwrap();
    }
    let child = Command::new(env!("CARGO_BIN_EXE_sea-service"))
        .arg("--root")
        .arg(root)
        .arg("--socket")
        .arg(socket)
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

fn exchange(socket: &Path, request_id: u64, request: Request) -> Response {
    let mut stream = UnixStream::connect(socket).unwrap();
    let encoded = encode(
        &Frame {
            request_id,
            message: Message::Request(request),
        },
        Limits::default(),
    )
    .unwrap();
    stream
        .write_all(&u32::try_from(encoded.len()).unwrap().to_be_bytes())
        .unwrap();
    stream.write_all(&encoded).unwrap();
    let mut length = [0_u8; 4];
    stream.read_exact(&mut length).unwrap();
    let mut response = vec![0_u8; u32::from_be_bytes(length) as usize];
    stream.read_exact(&mut response).unwrap();
    match decode(&response, Limits::default()).unwrap() {
        Frame {
            request_id: actual,
            message: Message::Response(response),
        } => {
            assert_eq!(actual, request_id);
            response
        }
        frame => panic!("unexpected frame: {frame:?}"),
    }
}

fn bytes(value: &'static [u8]) -> Bytes {
    Bytes::from_static(value)
}

fn create(socket: &Path, document: &'static [u8]) {
    assert_eq!(
        exchange(
            socket,
            1,
            Request::Create {
                document: bytes(document)
            }
        ),
        Response::Acknowledged(Acknowledgement::Created)
    );
}

fn open(socket: &Path, document: &'static [u8], session: &'static [u8]) {
    assert_eq!(
        exchange(
            socket,
            2,
            Request::OpenSession {
                document: bytes(document),
                writer: bytes(b"writer"),
                session: bytes(session),
                reference: Reference::Initial,
            },
        ),
        Response::Acknowledged(Acknowledgement::SessionOpened)
    );
}

fn submit(
    socket: &Path,
    document: &'static [u8],
    session: &'static [u8],
    sequence: u64,
) -> Response {
    exchange(
        socket,
        3 + sequence,
        Request::Submit(Submission {
            document: bytes(document),
            writer: bytes(b"writer"),
            session: bytes(session),
            submission: Bytes::from(format!("submission-{session:?}-{sequence}")),
            local_sequence_number: sequence,
            reference: Reference::Initial,
            payload: Bytes::from(format!("payload-{sequence}")),
        }),
    )
}

fn graceful_stop(socket: &Path, mut child: Child) {
    assert_eq!(
        exchange(socket, 99, Request::Shutdown),
        Response::Acknowledged(Acknowledgement::ShuttingDown)
    );
    assert!(child.wait().unwrap().success());
}

#[test]
fn kill_restart_recovery_and_stale_session_trace() {
    let directory = TempDirectory::new();
    let root = directory.0.join("data");
    let socket = directory.0.join("service.sock");
    let mut child = spawn_server(&root, &socket);

    create(&socket, b"one");
    open(&socket, b"one", b"session-one");
    let position = match submit(&socket, b"one", b"session-one", 1) {
        Response::Submitted {
            position,
            sequence_number: 1,
            ..
        } => position,
        response => panic!("unexpected response: {response:?}"),
    };
    assert_eq!(
        exchange(
            &socket,
            8,
            Request::PublishSnapshot {
                document: bytes(b"one"),
                includes_through: Reference::At(position.clone()),
                expected_parent: None,
                payload: bytes(b"snapshot-one"),
            },
        ),
        Response::Acknowledged(Acknowledgement::SnapshotPublished)
    );
    create(&socket, b"two");
    open(&socket, b"two", b"session-two-a");
    assert!(matches!(
        submit(&socket, b"two", b"session-two-a", 1),
        Response::Submitted {
            sequence_number: 1,
            ..
        }
    ));

    child.kill().unwrap();
    child.wait().unwrap();
    let child = spawn_server(&root, &socket);
    assert!(
        matches!(exchange(&socket, 9, Request::LatestSnapshot { document: bytes(b"one") }), Response::Snapshot(Some(snapshot)) if snapshot.payload == bytes(b"snapshot-one") && snapshot.includes_through == Reference::At(position))
    );
    open(&socket, b"one", b"session-one-restarted");
    assert_eq!(
        submit(&socket, b"one", b"session-one", 2),
        Response::Error(ErrorCode::StaleSession)
    );
    assert!(matches!(
        submit(&socket, b"one", b"session-one-restarted", 1),
        Response::Submitted {
            sequence_number: 2,
            ..
        }
    ));
    assert!(
        matches!(exchange(&socket, 10, Request::Read { document: bytes(b"two"), after: None }), Response::Read { records } if records.len() == 2)
    );
    graceful_stop(&socket, child);
}

#[test]
fn second_process_fences_first_process() {
    let directory = TempDirectory::new();
    let root = directory.0.join("data");
    let first_socket = directory.0.join("first.sock");
    let second_socket = directory.0.join("second.sock");
    let first = spawn_server(&root, &first_socket);
    create(&first_socket, b"doc");
    open(&first_socket, b"doc", b"session-one");

    let second = spawn_server(&root, &second_socket);
    open(&second_socket, b"doc", b"session-two");
    assert_eq!(
        submit(&first_socket, b"doc", b"session-one", 1),
        Response::Error(ErrorCode::FenceLost)
    );
    assert!(matches!(
        submit(&second_socket, b"doc", b"session-two", 1),
        Response::Submitted {
            sequence_number: 1,
            ..
        }
    ));
    graceful_stop(&second_socket, second);
    graceful_stop(&first_socket, first);
}
