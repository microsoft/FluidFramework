#![doc = "Single-host native Fluid service assembly."]

use std::{
    collections::BTreeMap,
    fs::{self, OpenOptions},
    future::Future,
    io::{Read, Write},
    path::PathBuf,
    sync::{Arc, RwLock},
    time::{SystemTime, UNIX_EPOCH},
};

use bytes::Bytes;
use fluid_sequencer::{
    AuthoritativeSequencer, FencedStream, PositionToken, Rejection, SequencedMessage,
    SequencerStorage, ServiceError as SequencerError, SessionId, Submission as SequencerSubmission,
    SubmissionId, SubmitOutcome, WriterId,
};
use fluid_service_protocol::{
    Acknowledgement, CommittedRecord, ErrorCode, PublishedSnapshot as ProtocolSnapshot, Reference,
    Request, Response, SubmissionDisposition,
};
use futures_util::StreamExt;
use snapshotted_stream_core::{
    AppendReceipt, AppendStream, ClassifiedError, ErrorKind, PublishedSnapshot, ReadRecord,
    Snapshot, SnapshotId, SnapshotPosition, SnapshotStore,
};
use snapshotted_stream_durable_log_spike::{DurableLog, DurableLogError, DurablePosition};
use tokio::sync::Mutex;

const SCOPE_FILE: &str = "service.scope";
const SCOPE_BYTES: usize = 16;
const ORDINAL_BYTES: usize = 8;
const TOKEN_BYTES: usize = SCOPE_BYTES + ORDINAL_BYTES;
const MAX_READ_RECORDS: usize = 1024;
const MAX_READ_PAYLOAD_BYTES: usize = 768 * 1024;

#[derive(Clone, Debug)]
pub struct ServiceConfig {
    pub root: PathBuf,
}

impl ServiceConfig {
    #[must_use]
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }
}

pub struct NativeService {
    config: ServiceConfig,
    documents: Mutex<BTreeMap<Bytes, Document>>,
}

impl NativeService {
    #[must_use]
    pub fn new(config: ServiceConfig) -> Self {
        Self {
            config,
            documents: Mutex::new(BTreeMap::new()),
        }
    }

    pub async fn handle(&self, request: Request) -> Response {
        match self.handle_result(request).await {
            Ok(response) => response,
            Err(code) => Response::Error(code),
        }
    }

    async fn handle_result(&self, request: Request) -> Result<Response, ErrorCode> {
        match request {
            Request::Create { document } => {
                let mut documents = self.documents.lock().await;
                if documents.contains_key(&document) || self.document_path(&document).exists() {
                    return Err(ErrorCode::DocumentAlreadyExists);
                }
                let opened = Document::create(
                    self.document_path(&document),
                    self.authority_path(&document),
                )
                .await?;
                documents.insert(document, opened);
                Ok(Response::Acknowledged(Acknowledgement::Created))
            }
            Request::Shutdown => Ok(Response::Acknowledged(Acknowledgement::ShuttingDown)),
            request => {
                let document_id = request_document(&request).ok_or(ErrorCode::InvalidRequest)?;
                let mut documents = self.documents.lock().await;
                if !documents.contains_key(document_id) {
                    let path = self.document_path(document_id);
                    if !path.exists() {
                        return Err(ErrorCode::DocumentNotFound);
                    }
                    let opened = Document::open(path, self.authority_path(document_id)).await?;
                    documents.insert(document_id.clone(), opened);
                }
                documents
                    .get_mut(document_id)
                    .ok_or(ErrorCode::DocumentNotFound)?
                    .handle(request)
                    .await
            }
        }
    }

    fn document_path(&self, document: &[u8]) -> PathBuf {
        self.config.root.join("documents").join(hex(document))
    }

    fn authority_path(&self, document: &[u8]) -> PathBuf {
        self.config
            .root
            .join("authorities")
            .join(format!("{}.epoch", hex(document)))
    }
}

fn request_document(request: &Request) -> Option<&Bytes> {
    match request {
        Request::OpenSession { document, .. }
        | Request::Read { document, .. }
        | Request::LatestSnapshot { document }
        | Request::PublishSnapshot { document, .. } => Some(document),
        Request::Submit(submission) => Some(&submission.document),
        Request::Create { .. } | Request::Shutdown => None,
    }
}

struct Document {
    storage: ServiceStorage,
    sequencer: AuthoritativeSequencer<ServiceStorage>,
}

impl Document {
    async fn create(path: PathBuf, authority_path: PathBuf) -> Result<Self, ErrorCode> {
        fs::create_dir_all(&path).map_err(|_| ErrorCode::Unavailable)?;
        let scope = new_scope().map_err(|_| ErrorCode::Unavailable)?;
        let scope_path = path.join(SCOPE_FILE);
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(scope_path)
            .map_err(|_| ErrorCode::DocumentAlreadyExists)?;
        file.write_all(&scope).map_err(|_| ErrorCode::Unavailable)?;
        file.sync_all().map_err(|_| ErrorCode::Unavailable)?;
        Self::open_with_scope(path, authority_path, scope).await
    }

    async fn open(path: PathBuf, authority_path: PathBuf) -> Result<Self, ErrorCode> {
        let mut scope = [0_u8; SCOPE_BYTES];
        let mut file = OpenOptions::new()
            .read(true)
            .open(path.join(SCOPE_FILE))
            .map_err(|_| ErrorCode::Corrupt)?;
        file.read_exact(&mut scope)
            .map_err(|_| ErrorCode::Corrupt)?;
        let mut trailing = [0_u8; 1];
        if file.read(&mut trailing).map_err(|_| ErrorCode::Corrupt)? != 0 {
            return Err(ErrorCode::Corrupt);
        }
        Self::open_with_scope(path, authority_path, scope).await
    }

    async fn open_with_scope(
        path: PathBuf,
        authority_path: PathBuf,
        scope: [u8; SCOPE_BYTES],
    ) -> Result<Self, ErrorCode> {
        if let Some(parent) = authority_path.parent() {
            fs::create_dir_all(parent).map_err(|_| ErrorCode::Unavailable)?;
        }
        let log = DurableLog::open(path).map_err(|error| map_storage_error(&error))?;
        let storage = ServiceStorage::new(log, scope).await?;
        let fenced = FencedStream::with_deployment_authority(storage.clone(), authority_path)
            .map_err(|_| ErrorCode::Unavailable)?;
        let fence = fenced
            .try_issue_fence()
            .map_err(|_| ErrorCode::Unavailable)?;
        let sequencer = AuthoritativeSequencer::recover(fenced, fence)
            .await
            .map_err(map_sequencer_error)?;
        Ok(Self { storage, sequencer })
    }

    async fn handle(&mut self, request: Request) -> Result<Response, ErrorCode> {
        match request {
            Request::OpenSession {
                writer,
                session,
                reference,
                ..
            } => self.open_session(writer, session, reference).await,
            Request::Submit(submission) => self.submit(submission).await,
            Request::Read { after, .. } => self.read(after).await,
            Request::LatestSnapshot { .. } => self.latest_snapshot().await,
            Request::PublishSnapshot {
                includes_through,
                expected_parent,
                payload,
                ..
            } => {
                self.publish_snapshot(includes_through, expected_parent, payload)
                    .await
            }
            Request::Create { .. } | Request::Shutdown => Err(ErrorCode::InvalidRequest),
        }
    }

    async fn open_session(
        &mut self,
        writer: Bytes,
        session: Bytes,
        reference: Reference,
    ) -> Result<Response, ErrorCode> {
        self.sequencer
            .connect(
                WriterId::new(writer).map_err(|_| ErrorCode::InvalidRequest)?,
                SessionId::new(session).map_err(|_| ErrorCode::InvalidRequest)?,
                protocol_reference(reference)?,
            )
            .await
            .map_err(map_sequencer_error)?;
        Ok(Response::Acknowledged(Acknowledgement::SessionOpened))
    }

    async fn submit(
        &mut self,
        submission: fluid_service_protocol::Submission,
    ) -> Result<Response, ErrorCode> {
        let outcome = self
            .sequencer
            .submit(SequencerSubmission {
                writer_id: WriterId::new(submission.writer)
                    .map_err(|_| ErrorCode::InvalidRequest)?,
                session_id: SessionId::new(submission.session)
                    .map_err(|_| ErrorCode::InvalidRequest)?,
                submission_id: SubmissionId::new(submission.submission)
                    .map_err(|_| ErrorCode::InvalidRequest)?,
                local_sequence_number: submission.local_sequence_number,
                reference_position: protocol_reference(submission.reference)?,
                payload: submission.payload,
            })
            .await
            .map_err(map_sequencer_error)?;
        let (disposition, message) = match outcome {
            SubmitOutcome::Accepted(message) => (SubmissionDisposition::Accepted, message),
            SubmitOutcome::Duplicate(message) => (SubmissionDisposition::Duplicate, message),
        };
        Ok(submitted_response(disposition, message))
    }

    async fn read(&self, after: Option<Bytes>) -> Result<Response, ErrorCode> {
        let after = match after {
            Some(token) => Some(self.storage.decode_position(&token).await?),
            None => None,
        };
        let mut reader = self
            .storage
            .log
            .read(after.as_ref())
            .await
            .map_err(|error| map_storage_error(&error))?;
        let mut records = Vec::new();
        let mut payload_bytes = 0_usize;
        while let Some(record) = reader.next().await {
            let record = record.map_err(|error| map_storage_error(&error))?;
            let next_payload_bytes = payload_bytes.saturating_add(record.payload.len());
            if !records.is_empty()
                && (records.len() == MAX_READ_RECORDS
                    || next_payload_bytes > MAX_READ_PAYLOAD_BYTES)
            {
                break;
            }
            payload_bytes = next_payload_bytes;
            records.push(CommittedRecord {
                position: self.storage.token_for(&record.position)?,
                payload: record.payload,
            });
        }
        Ok(Response::Read { records })
    }

    async fn latest_snapshot(&self) -> Result<Response, ErrorCode> {
        let latest = self
            .storage
            .log
            .latest()
            .await
            .map_err(|error| map_storage_error(&error))?;
        Ok(Response::Snapshot(
            latest
                .map(|snapshot| self.protocol_snapshot(snapshot))
                .transpose()?,
        ))
    }

    async fn publish_snapshot(
        &self,
        includes_through: Reference,
        expected_parent: Option<Bytes>,
        payload: Bytes,
    ) -> Result<Response, ErrorCode> {
        let includes_through = match includes_through {
            Reference::Initial => SnapshotPosition::Initial,
            Reference::At(token) => {
                SnapshotPosition::At(self.storage.decode_position(&token).await?)
            }
        };
        let expected_parent = expected_parent.map(SnapshotId::from_bytes);
        self.storage
            .log
            .publish(
                Snapshot {
                    includes_through,
                    payload,
                },
                expected_parent.as_ref(),
            )
            .await
            .map_err(|error| map_storage_error(&error))?;
        Ok(Response::Acknowledged(Acknowledgement::SnapshotPublished))
    }

    fn protocol_snapshot(
        &self,
        snapshot: PublishedSnapshot<DurablePosition>,
    ) -> Result<ProtocolSnapshot, ErrorCode> {
        Ok(ProtocolSnapshot {
            id: snapshot.id.as_bytes().clone(),
            includes_through: match snapshot.snapshot.includes_through {
                SnapshotPosition::Initial => Reference::Initial,
                SnapshotPosition::At(position) => Reference::At(self.storage.token_for(&position)?),
            },
            payload: snapshot.snapshot.payload,
        })
    }
}

#[derive(Clone)]
struct ServiceStorage {
    log: DurableLog,
    scope: [u8; SCOPE_BYTES],
    positions: Arc<RwLock<Vec<DurablePosition>>>,
}

impl ServiceStorage {
    async fn new(log: DurableLog, scope: [u8; SCOPE_BYTES]) -> Result<Self, ErrorCode> {
        let storage = Self {
            log,
            scope,
            positions: Arc::new(RwLock::new(Vec::new())),
        };
        storage
            .refresh()
            .await
            .map_err(|error| map_storage_error(&error))?;
        Ok(storage)
    }

    async fn refresh(&self) -> Result<Vec<ReadRecord<DurablePosition>>, DurableLogError> {
        let mut reader = self.log.read(None).await?;
        let mut records = Vec::new();
        while let Some(record) = reader.next().await {
            records.push(record?);
        }
        let positions = records
            .iter()
            .map(|record| record.position.clone())
            .collect();
        *self
            .positions
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = positions;
        Ok(records)
    }

    fn token_for(&self, position: &DurablePosition) -> Result<Bytes, ErrorCode> {
        let positions = self
            .positions
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let index = positions
            .iter()
            .position(|candidate| candidate == position)
            .ok_or(ErrorCode::InvalidPosition)?;
        let ordinal = u64::try_from(index + 1).map_err(|_| ErrorCode::InvalidPosition)?;
        let mut token = Vec::with_capacity(TOKEN_BYTES);
        token.extend_from_slice(&self.scope);
        token.extend_from_slice(&ordinal.to_be_bytes());
        Ok(Bytes::from(token))
    }

    async fn decode_position(&self, token: &[u8]) -> Result<DurablePosition, ErrorCode> {
        if token.len() != TOKEN_BYTES || token[..SCOPE_BYTES] != self.scope {
            return Err(ErrorCode::InvalidPosition);
        }
        let ordinal = u64::from_be_bytes(
            token[SCOPE_BYTES..]
                .try_into()
                .map_err(|_| ErrorCode::InvalidPosition)?,
        );
        if ordinal == 0 {
            return Err(ErrorCode::InvalidPosition);
        }
        let records = self
            .refresh()
            .await
            .map_err(|error| map_storage_error(&error))?;
        let index = usize::try_from(ordinal - 1).map_err(|_| ErrorCode::InvalidPosition)?;
        records
            .get(index)
            .map(|record| record.position.clone())
            .ok_or(ErrorCode::InvalidPosition)
    }
}

impl SequencerStorage for ServiceStorage {
    type Position = DurablePosition;
    type Error = DurableLogError;

    async fn append(&self, value: Bytes) -> Result<AppendReceipt<Self::Position>, Self::Error> {
        let receipt = self.log.append(value).await?;
        self.positions
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .push(receipt.position.clone());
        Ok(receipt)
    }

    fn read_all(
        &self,
    ) -> impl Future<Output = Result<Vec<ReadRecord<Self::Position>>, Self::Error>> + Send {
        self.refresh()
    }

    fn encode_position(&self, position: &Self::Position) -> Result<Bytes, Self::Error> {
        self.token_for(position)
            .map_err(|_| DurableLogError::InvalidPosition)
    }
}

fn protocol_reference(reference: Reference) -> Result<SnapshotPosition<PositionToken>, ErrorCode> {
    match reference {
        Reference::Initial => Ok(SnapshotPosition::Initial),
        Reference::At(token) => Ok(SnapshotPosition::At(
            PositionToken::new(token).map_err(|_| ErrorCode::InvalidPosition)?,
        )),
    }
}

fn submitted_response(disposition: SubmissionDisposition, message: SequencedMessage) -> Response {
    Response::Submitted {
        disposition,
        position: message.stream_position.as_bytes().clone(),
        sequence_number: message.sequence_number,
        minimum_reference: match message.minimum_reference_position {
            SnapshotPosition::Initial => Reference::Initial,
            SnapshotPosition::At(position) => Reference::At(position.as_bytes().clone()),
        },
    }
}

fn map_sequencer_error(error: SequencerError<DurableLogError>) -> ErrorCode {
    match error {
        SequencerError::Rejected(rejection) | SequencerError::InvalidCommittedEntry(rejection) => {
            map_rejection(&rejection)
        }
        SequencerError::FenceLost => ErrorCode::FenceLost,
        SequencerError::Authority(_) => ErrorCode::Unavailable,
        SequencerError::Storage(error) => map_storage_error(&error),
        SequencerError::StorageAmbiguous(_) => ErrorCode::Ambiguous,
        SequencerError::RecoveryRequired => ErrorCode::RecoveryRequired,
        SequencerError::CorruptLog(_) => ErrorCode::Corrupt,
    }
}

fn map_rejection(rejection: &Rejection) -> ErrorCode {
    match rejection {
        Rejection::SessionAlreadyUsed => ErrorCode::SessionAlreadyUsed,
        Rejection::UnknownWriter => ErrorCode::UnknownWriter,
        Rejection::StaleSession => ErrorCode::StaleSession,
        Rejection::DuplicateLocalSequence { .. } => ErrorCode::DuplicateLocalSequence,
        Rejection::LocalSequenceGap { .. } => ErrorCode::LocalSequenceGap,
        Rejection::UnknownReferencePosition => ErrorCode::UnknownReferencePosition,
        Rejection::StaleReferencePosition => ErrorCode::StaleReferencePosition,
        Rejection::SubmissionIdentityConflict => ErrorCode::SubmissionIdentityConflict,
    }
}

fn map_storage_error(error: &DurableLogError) -> ErrorCode {
    match error.kind() {
        ErrorKind::InvalidPosition => ErrorCode::InvalidPosition,
        ErrorKind::StalePosition => ErrorCode::StalePosition,
        ErrorKind::Conflict => ErrorCode::Conflict,
        ErrorKind::Rejected => ErrorCode::Rejected,
        ErrorKind::Ambiguous => ErrorCode::Ambiguous,
        ErrorKind::Unavailable => ErrorCode::Unavailable,
        ErrorKind::Corrupt => ErrorCode::Corrupt,
    }
}

fn new_scope() -> Result<[u8; SCOPE_BYTES], std::time::SystemTimeError> {
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    Ok((timestamp ^ (u128::from(std::process::id()) << 64)).to_be_bytes())
}

fn hex(value: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(value.len() * 2);
    for byte in value {
        encoded.push(char::from(DIGITS[usize::from(byte >> 4)]));
        encoded.push(char::from(DIGITS[usize::from(byte & 0x0f)]));
    }
    encoded
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};

    use fluid_service_protocol::{Request, Submission};

    use super::*;

    static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(1);

    struct TempDirectory(PathBuf);

    impl TempDirectory {
        fn new() -> Self {
            let value = NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "fluid-native-service-{}-{value}",
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

    fn bytes(value: &'static [u8]) -> Bytes {
        Bytes::from_static(value)
    }

    fn submit(document: &'static [u8], session: &'static [u8], sequence: u64) -> Request {
        Request::Submit(Submission {
            document: bytes(document),
            writer: bytes(b"writer"),
            session: bytes(session),
            submission: Bytes::from(format!("submission-{session:?}-{sequence}")),
            local_sequence_number: sequence,
            reference: Reference::Initial,
            payload: Bytes::from(format!("payload-{sequence}")),
        })
    }

    async fn create_and_open(
        service: &NativeService,
        document: &'static [u8],
        session: &'static [u8],
    ) {
        assert_eq!(
            service
                .handle(Request::Create {
                    document: bytes(document)
                })
                .await,
            Response::Acknowledged(Acknowledgement::Created)
        );
        assert_eq!(
            service
                .handle(Request::OpenSession {
                    document: bytes(document),
                    writer: bytes(b"writer"),
                    session: bytes(session),
                    reference: Reference::Initial
                })
                .await,
            Response::Acknowledged(Acknowledgement::SessionOpened)
        );
    }

    #[tokio::test]
    async fn creates_and_reads_two_isolated_documents() {
        let directory = TempDirectory::new();
        let service = NativeService::new(ServiceConfig::new(&directory.0));
        create_and_open(&service, b"one", b"session-one").await;
        create_and_open(&service, b"two", b"session-two").await;
        assert!(matches!(
            service.handle(submit(b"one", b"session-one", 1)).await,
            Response::Submitted {
                sequence_number: 1,
                ..
            }
        ));
        assert!(matches!(
            service.handle(submit(b"two", b"session-two", 1)).await,
            Response::Submitted {
                sequence_number: 1,
                ..
            }
        ));
        for document in [b"one".as_slice(), b"two".as_slice()] {
            assert!(
                matches!(service.handle(Request::Read { document: Bytes::copy_from_slice(document), after: None }).await, Response::Read { records } if records.len() == 2)
            );
        }
    }

    #[tokio::test]
    async fn rejects_invalid_and_stale_sessions_before_append() {
        let directory = TempDirectory::new();
        let service = NativeService::new(ServiceConfig::new(&directory.0));
        create_and_open(&service, b"doc", b"session-one").await;
        assert_eq!(
            service.handle(submit(b"doc", b"unknown", 1)).await,
            Response::Error(ErrorCode::StaleSession)
        );
        assert_eq!(
            service
                .handle(Request::OpenSession {
                    document: bytes(b"doc"),
                    writer: bytes(b"writer"),
                    session: bytes(b"session-two"),
                    reference: Reference::Initial
                })
                .await,
            Response::Acknowledged(Acknowledgement::SessionOpened)
        );
        assert_eq!(
            service.handle(submit(b"doc", b"session-one", 1)).await,
            Response::Error(ErrorCode::StaleSession)
        );
        assert!(
            matches!(service.handle(Request::Read { document: bytes(b"doc"), after: None }).await, Response::Read { records } if records.len() == 2)
        );
    }

    #[tokio::test]
    async fn snapshot_and_restart_recover() {
        let directory = TempDirectory::new();
        let service = NativeService::new(ServiceConfig::new(&directory.0));
        create_and_open(&service, b"doc", b"session-one").await;
        let position = match service.handle(submit(b"doc", b"session-one", 1)).await {
            Response::Submitted { position, .. } => position,
            response => panic!("unexpected response: {response:?}"),
        };
        assert_eq!(
            service
                .handle(Request::PublishSnapshot {
                    document: bytes(b"doc"),
                    includes_through: Reference::At(position.clone()),
                    expected_parent: None,
                    payload: bytes(b"snapshot")
                })
                .await,
            Response::Acknowledged(Acknowledgement::SnapshotPublished)
        );
        drop(service);
        let recovered = NativeService::new(ServiceConfig::new(&directory.0));
        assert!(
            matches!(recovered.handle(Request::LatestSnapshot { document: bytes(b"doc") }).await, Response::Snapshot(Some(snapshot)) if snapshot.payload == bytes(b"snapshot") && snapshot.includes_through == Reference::At(position))
        );
        assert_eq!(
            recovered
                .handle(Request::OpenSession {
                    document: bytes(b"doc"),
                    writer: bytes(b"writer"),
                    session: bytes(b"session-two"),
                    reference: Reference::Initial
                })
                .await,
            Response::Acknowledged(Acknowledgement::SessionOpened)
        );
        assert!(matches!(
            recovered.handle(submit(b"doc", b"session-two", 1)).await,
            Response::Submitted {
                sequence_number: 2,
                ..
            }
        ));
    }

    #[tokio::test]
    async fn second_service_fences_stale_owner() {
        let directory = TempDirectory::new();
        let first = NativeService::new(ServiceConfig::new(&directory.0));
        create_and_open(&first, b"doc", b"session-one").await;
        let second = NativeService::new(ServiceConfig::new(&directory.0));
        assert_eq!(
            second
                .handle(Request::OpenSession {
                    document: bytes(b"doc"),
                    writer: bytes(b"writer"),
                    session: bytes(b"session-two"),
                    reference: Reference::Initial
                })
                .await,
            Response::Acknowledged(Acknowledgement::SessionOpened)
        );
        assert_eq!(
            first.handle(submit(b"doc", b"session-one", 1)).await,
            Response::Error(ErrorCode::FenceLost)
        );
    }

    #[tokio::test]
    async fn malformed_and_foreign_tokens_are_rejected() {
        let directory = TempDirectory::new();
        let service = NativeService::new(ServiceConfig::new(&directory.0));
        create_and_open(&service, b"doc", b"session-one").await;
        assert_eq!(
            service
                .handle(Request::Read {
                    document: bytes(b"doc"),
                    after: Some(bytes(b"invalid"))
                })
                .await,
            Response::Error(ErrorCode::InvalidPosition)
        );
        assert_eq!(
            service
                .handle(Request::PublishSnapshot {
                    document: bytes(b"doc"),
                    includes_through: Reference::At(bytes(b"invalid")),
                    expected_parent: None,
                    payload: bytes(b"snapshot")
                })
                .await,
            Response::Error(ErrorCode::InvalidPosition)
        );
    }
}
