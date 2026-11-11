//! Real file-read failure through a physical opening stream and direct `SharedTree` recovery.

use std::{
    io,
    path::{Path, PathBuf},
    pin::Pin,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    task::{Context, Poll, ready},
    time::Duration,
};

use async_trait::async_trait;
use futures_util::{StreamExt as _, stream};
use sea_core::{BlobBody, BlobReader};
use sea_webtransport::protocol;
use sea_webtransport_server::{
    DocumentHost, LivenessPolicy, SeaConnectionService, SeaContentResponse, SeaContentStream,
    SeaLoadStreams, SeaProtocolHost, SeaResponseStream, SeaServiceHost, SessionSetup, ShutdownMode,
    StorageSetup, TransportConfig, WebTransportServer,
};
use tokio::io::{AsyncRead, ReadBuf};
use wtransport::Identity;

/// One extra speculative body waits until a direct host is established before failing.
struct FaultHost {
    /// Real document host, including file publication and session authority.
    inner: Arc<dyn SeaServiceHost>,
    /// Owned fixture namespace.
    root: PathBuf,
    /// Browser-controlled identity of the deliberately unused payload.
    marker: PathBuf,
    /// Only the first opening gets a fault; recovery must use the ordinary host.
    claimed: Arc<AtomicBool>,
    /// Confirms the physical file was truncated after its reader produced bytes.
    truncated: Arc<AtomicBool>,
}

impl SeaServiceHost for FaultHost {
    fn connect(&self, liveness: LivenessPolicy) -> Arc<dyn SeaConnectionService> {
        Arc::new(FaultConnection {
            inner: self.inner.connect(liveness),
            host: Arc::clone(&self.inner),
            root: self.root.clone(),
            marker: self.marker.clone(),
            claimed: Arc::clone(&self.claimed),
            truncated: Arc::clone(&self.truncated),
        })
    }
}

/// Forwards ordinary operations unchanged and injects only opening-content source failure.
struct FaultConnection {
    /// Real connection authority.
    inner: Arc<dyn SeaConnectionService>,
    /// Flushes buffered fixture publication before opening its body.
    host: Arc<dyn SeaServiceHost>,
    /// Fixture namespace to locate the published file.
    root: PathBuf,
    /// Coordination file written by the test-only browser route.
    marker: PathBuf,
    /// Shares the single fault across all connections.
    claimed: Arc<AtomicBool>,
    /// Records that the actual storage fault occurred.
    truncated: Arc<AtomicBool>,
}

#[async_trait]
impl SeaConnectionService for FaultConnection {
    async fn bind_session(
        self: Arc<Self>,
        authority: &[u8],
    ) -> Result<Arc<dyn SeaConnectionService>, protocol::Response> {
        Arc::clone(&self.inner).bind_session(authority).await
    }
    async fn connection_closed(&self, grace: bool) {
        self.inner.connection_closed(grace).await;
    }
    async fn open_event_stream(
        &self,
        request: protocol::Request,
    ) -> Result<SeaLoadStreams, protocol::Response> {
        let mut loaded = self.inner.open_event_stream(request).await?;
        if !self.claimed.load(Ordering::SeqCst) {
            let claimed = Arc::clone(&self.claimed);
            let marker = self.marker.clone();
            let root = self.root.clone();
            let inner = Arc::clone(&self.inner);
            let host = Arc::clone(&self.host);
            let truncated = Arc::clone(&self.truncated);
            let extra = stream::once(async move {
                let digest = loop {
                    let path = marker.clone();
                    match tokio::task::spawn_blocking(move || std::fs::read_to_string(path))
                        .await
                        .unwrap()
                    {
                        Ok(digest) => break digest,
                        Err(error) if error.kind() == io::ErrorKind::NotFound => {
                            tokio::time::sleep(Duration::from_millis(5)).await;
                        }
                        Err(error) => panic!("fault marker: {error}"),
                    }
                };
                if claimed.swap(true, Ordering::SeqCst) {
                    return protocol::Response::LoadContentComplete.into();
                }
                let mut id = [0; 32];
                for (index, byte) in id.iter_mut().enumerate() {
                    *byte = u8::from_str_radix(&digest[index * 2..index * 2 + 2], 16).unwrap();
                }
                host.flush().await.unwrap();
                let mut content = inner
                    .content_request(protocol::Request::GetBlobTrees {
                        roots: vec![protocol::TreeId::Blob(id)],
                        hint: protocol::LoadingHint::default(),
                    })
                    .await
                    .unwrap();
                let Some(SeaContentResponse::Blob {
                    body: BlobBody::Reader { length, reader },
                    ..
                }) = content.next().await
                else {
                    panic!(
                        "fault must use a persisted file body, not an overlay or synthetic error"
                    )
                };
                let file = tokio::task::spawn_blocking(move || {
                    find_content(&root, &format!("01{digest}"))
                })
                .await
                .unwrap();
                SeaContentResponse::Blob {
                    id,
                    body: BlobBody::Reader {
                        length,
                        reader: Box::pin(TruncateAfterRead {
                            reader,
                            file: Some(file),
                            first_read: false,
                            truncating: None,
                            truncated,
                        }),
                    },
                }
            });
            loaded.content = Box::pin(loaded.content.chain(extra));
        }
        Ok(loaded)
    }
    async fn event_stream(
        &self,
        after: Option<u64>,
        hint: protocol::LoadingHint,
    ) -> Result<SeaLoadStreams, protocol::Response> {
        self.inner.event_stream(after, hint).await
    }
    async fn author_request(&self, request: protocol::Request) -> protocol::Response {
        self.inner.author_request(request).await
    }
    async fn snapshot_stream(
        &self,
        request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response> {
        self.inner.snapshot_stream(request).await
    }
    async fn snapshot_request(&self, request: protocol::Request) -> protocol::Response {
        self.inner.snapshot_request(request).await
    }
    async fn revoke_snapshot_publisher(&self) {
        self.inner.revoke_snapshot_publisher().await;
    }
    async fn open_content_stream(&self, request: protocol::Request) -> protocol::Response {
        self.inner.open_content_stream(request).await
    }
    async fn content_request(
        &self,
        request: protocol::Request,
    ) -> Result<SeaContentStream, protocol::Response> {
        self.inner.content_request(request).await
    }
}

/// Locates only the named published fixture in the test-owned namespace.
fn find_content(root: &Path, name: &str) -> PathBuf {
    let mut pending = vec![root.to_owned()];
    while let Some(directory) = pending.pop() {
        for entry in std::fs::read_dir(directory).unwrap() {
            let entry = entry.unwrap();
            if entry.file_name() == name {
                return entry.path();
            }
            if entry.file_type().unwrap().is_dir() {
                pending.push(entry.path());
            }
        }
    }
    panic!("missing published test blob {name}")
}

/// Limits the first read, then truncates the real file before permitting its next read.
struct TruncateAfterRead {
    /// Production file reader, including its admission budget and lease.
    reader: BlobReader,
    /// Path retained until the blocking truncation has been dispatched.
    file: Option<PathBuf>,
    /// Whether bytes have passed through the production frame writer.
    first_read: bool,
    /// Test-only storage fault, never synchronous I/O on the executor.
    truncating: Option<tokio::task::JoinHandle<io::Result<()>>>,
    /// Records completed physical truncation.
    truncated: Arc<AtomicBool>,
}

impl AsyncRead for TruncateAfterRead {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        output: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        if output.remaining() == 0 {
            return Poll::Ready(Ok(()));
        }
        if !self.first_read {
            let mut bytes = [0; 7];
            let limit = output.remaining().min(bytes.len());
            let mut buffer = ReadBuf::new(&mut bytes[..limit]);
            ready!(self.reader.as_mut().poll_read(cx, &mut buffer))?;
            assert!(!buffer.filled().is_empty());
            output.put_slice(buffer.filled());
            self.first_read = true;
            return Poll::Ready(Ok(()));
        }
        if let Some(file) = self.file.take() {
            self.truncating = Some(tokio::task::spawn_blocking(move || {
                std::fs::OpenOptions::new()
                    .write(true)
                    .open(file)?
                    .set_len(33)
            }));
        }
        if let Some(truncating) = &mut self.truncating {
            ready!(Pin::new(truncating).poll(cx)).unwrap()?;
            self.truncating = None;
            self.truncated.store(true, Ordering::SeqCst);
        }
        self.reader.as_mut().poll_read(cx, output)
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "run by the browser harness after building the SharedTree fixture"]
async fn file_body_failure_recovers_direct_shared_tree_without_lost_or_duplicate_edits() {
    for durable in [false, true] {
        for websocket in [false, true]
            .into_iter()
            .filter(|socket| !socket || cfg!(feature = "websocket-stream"))
        {
            let root = std::env::temp_dir().join(format!(
                "sea-streamed-recovery-{}-{durable}-{websocket}",
                std::process::id()
            ));
            std::fs::create_dir(&root).unwrap();
            if durable {
                run_recovery(
                    StorageSetup::durable(root.join("data")),
                    root,
                    durable,
                    websocket,
                )
                .await;
            } else {
                run_recovery(
                    StorageSetup::buffered(root.join("data")),
                    root,
                    durable,
                    websocket,
                )
                .await;
            }
        }
    }
}

/// Runs one storage/transport pair with explicit ownership of the listener, browser, and files.
async fn run_recovery<S: sea_core::storage::SeaStorage + 'static>(
    storage: StorageSetup<S>,
    root: PathBuf,
    durable: bool,
    websocket: bool,
) {
    let data = root.join("data");
    let marker = root.join("fault");
    let inner = Arc::new(SeaProtocolHost::new(
        DocumentHost::new(storage, SessionSetup::default()).unwrap(),
    ));
    let truncated = Arc::new(AtomicBool::new(false));
    let host = Arc::new(FaultHost {
        inner: inner.clone(),
        root: data,
        marker: marker.clone(),
        claimed: Arc::default(),
        truncated: truncated.clone(),
    });
    let identity = Identity::self_signed(["localhost", "127.0.0.1"]).unwrap();
    let hash = identity.certificate_chain().as_slice()[0]
        .hash()
        .fmt(wtransport::tls::Sha256DigestFmt::DottedHex)
        .replace(':', "");
    let http = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = http.local_addr().unwrap().port();
    drop(http);
    let config = TransportConfig {
        liveness: LivenessPolicy {
            reconnect_grace: Duration::from_millis(20),
            ..LivenessPolicy::default()
        },
        ..TransportConfig::default()
    };
    let (url, shutdown, serving) = if websocket {
        #[cfg(feature = "websocket-stream")]
        {
            let server = sea_webtransport_server::WebSocketServer::bind(
                "127.0.0.1:0".parse().unwrap(),
                host,
                config,
                vec![format!("http://localhost:{port}")],
            )
            .await
            .unwrap();
            let url = format!("ws://{}/sea/websocket", server.local_addr().unwrap());
            (
                url,
                server.shutdown_handle(),
                tokio::spawn(server.serve_until_shutdown()),
            )
        }
        #[cfg(not(feature = "websocket-stream"))]
        unreachable!()
    } else {
        let server =
            WebTransportServer::bind("127.0.0.1:0".parse().unwrap(), identity, host, config)
                .unwrap();
        let url = format!("https://{}/sea", server.local_addr().unwrap());
        (
            url,
            server.shutdown_handle(),
            tokio::spawn(server.serve_until_shutdown()),
        )
    };
    let output =
        tokio::task::spawn_blocking(move || run_browser(&url, &hash, port, &marker, websocket))
            .await
            .unwrap();
    shutdown.shutdown(ShutdownMode::Immediate).unwrap();
    serving.await.unwrap().unwrap();
    inner.shutdown().await.unwrap();
    println!(
        "durable={durable} websocket={websocket}\n{}",
        String::from_utf8_lossy(&output.stdout)
    );
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        truncated.load(Ordering::SeqCst),
        "fixture never caused a physical read failure"
    );
    std::fs::remove_dir_all(root).unwrap();
}

/// Runs the browser driver with the fixture's narrowly scoped fault route enabled.
fn run_browser(
    url: &str,
    hash: &str,
    port: u16,
    marker: &Path,
    websocket: bool,
) -> std::process::Output {
    std::process::Command::new("node")
        .current_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/../.."))
        .args([
            "tests/sea-integration-tests/browser/run-headless.mjs",
            "tests/sea-integration-tests",
            url,
            hash,
            "__sharedTreeResult",
            "shared-tree.html",
            &format!(
                "streamingFault=true&faultTransport={}",
                if websocket {
                    "websocket"
                } else {
                    "webtransport"
                }
            ),
        ])
        .env("BENCHMARK_HTTP_PORT", port.to_string())
        .env("SEA_TEST_BLOB_FAULT_MARKER", marker)
        .output()
        .unwrap()
}
