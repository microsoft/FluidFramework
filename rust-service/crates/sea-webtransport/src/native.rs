//! Native certificate-pinned [`SeaSession`] client.

use std::{collections::BTreeMap, error::Error, fmt, sync::Arc};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{StreamExt as _, stream};
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError, Durability, ErrorKind,
    Event, EventPosition, SnapshotId,
    archive::{
        AuthorId, CommittedEvent, EventReceipt, EventSubmission, LoadEvent, OperationId,
        PublishedSnapshot, SeaArchive, SeaAuthorSession, SeaEventSubscription, SeaService,
        SeaSnapshotCoordinator, SessionCommittedEvent, SessionId, SessionStream, Snapshot,
        SnapshotPosition, SnapshotPublication,
    },
};
use tokio::time::timeout;
use wtransport::{Connection, Endpoint, endpoint::endpoint_side::Client, tls::Sha256Digest};

use crate::{
    CLOSE_CODE, TransportConfig, WebTransportError,
    client::{ClientState, ClientStateError},
    connect_once, protocol, read_sea_stream_frame, read_sea_unary_frame, transport_error,
    write_frame,
};

/// Failure from a native typed Sea client.
#[derive(Debug)]
pub enum SeaClientError {
    /// The underlying connection or framing failed.
    Transport(WebTransportError),
    /// The service returned a classified Sea failure.
    Service(protocol::ErrorKind, String),
    /// The service returned a response that does not match the request.
    UnexpectedResponse,
    /// The client was explicitly closed.
    Closed,
}

impl fmt::Display for SeaClientError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Transport(error) => write!(formatter, "transport failed: {error}"),
            Self::Service(_, message) => formatter.write_str(message),
            Self::UnexpectedResponse => {
                formatter.write_str("service returned an unexpected response")
            }
            Self::Closed => formatter.write_str("Sea client is closed"),
        }
    }
}

impl Error for SeaClientError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Transport(error) => Some(error),
            Self::Service(_, _) | Self::UnexpectedResponse | Self::Closed => None,
        }
    }
}

impl ClassifiedError for SeaClientError {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Transport(_) | Self::UnexpectedResponse => ErrorKind::Unavailable,
            Self::Closed => ErrorKind::Rejected,
            Self::Service(kind, _) => match kind {
                protocol::ErrorKind::Invalid => ErrorKind::InvalidPosition,
                protocol::ErrorKind::Stale => ErrorKind::StalePosition,
                protocol::ErrorKind::Conflict => ErrorKind::Conflict,
                protocol::ErrorKind::Rejected => ErrorKind::Rejected,
                protocol::ErrorKind::Ambiguous => ErrorKind::Ambiguous,
                protocol::ErrorKind::Unavailable => ErrorKind::Unavailable,
                protocol::ErrorKind::Corrupt => ErrorKind::Corrupt,
            },
        }
    }
}

impl From<WebTransportError> for SeaClientError {
    fn from(error: WebTransportError) -> Self {
        Self::Transport(error)
    }
}

impl From<protocol::ProtocolError> for SeaClientError {
    fn from(error: protocol::ProtocolError) -> Self {
        Self::Transport(WebTransportError::SeaProtocol(error))
    }
}

impl From<ClientStateError> for SeaClientError {
    fn from(error: ClientStateError) -> Self {
        match error {
            ClientStateError::Closed => Self::Closed,
            ClientStateError::Protocol(error) => error.into(),
            ClientStateError::Poisoned => Self::Transport(WebTransportError::Transport(
                "shared client state is unavailable".to_owned(),
            )),
        }
    }
}

/// Native WebTransport client bound to one open Sea archive session.
pub struct NativeSeaClient {
    _endpoint: Endpoint<Client>,
    connection: Connection,
    config: TransportConfig,
    state: Arc<ClientState>,
}

/// Values that identify and initialize one native archive-bound session.
pub struct NativeSessionOpen {
    /// Archive selected for this session.
    pub archive: Bytes,
    /// Whether the archive is created or must already exist.
    pub intent: protocol::ArchiveIntent,
    /// Stable author identity.
    pub author: AuthorId,
    /// Fresh session identity.
    pub session: SessionId,
    /// Latest event incorporated by the author.
    pub reference: Option<EventPosition>,
}

impl NativeSeaClient {
    /// Connects to `/sea` and opens one archive-bound logical session.
    ///
    /// # Errors
    ///
    /// Returns a transport, protocol, or session-open failure.
    pub async fn connect(
        url: impl Into<String>,
        certificate_hash: Sha256Digest,
        config: TransportConfig,
        open: NativeSessionOpen,
    ) -> Result<Self, SeaClientError> {
        config.validate()?;
        let url = url.into();
        let (endpoint, connection) =
            connect_once(&url, certificate_hash, config.operation_timeout).await?;
        let client = Self {
            _endpoint: endpoint,
            connection,
            config,
            state: Arc::new(ClientState::default()),
        };
        match client
            .request(protocol::Request::OpenSession {
                version: protocol::PROTOCOL_VERSION,
                archive: open.archive.to_vec(),
                intent: open.intent,
                author: open.author.as_bytes().to_vec(),
                session: open.session.as_bytes().to_vec(),
                reference: open.reference.map(EventPosition::get),
            })
            .await?
        {
            protocol::Response::Acknowledged => Ok(client),
            response => Err(response_error(response)),
        }
    }

    async fn request(
        &self,
        request: protocol::Request,
    ) -> Result<protocol::Response, SeaClientError> {
        let pending = self.state.begin(request.stream_role())?;
        let request_id = pending.id();
        let limits = self.sea_limits();
        let request = protocol::encode(
            &protocol::Frame {
                request_id,
                message: request,
            },
            limits,
        )?;
        let (mut send, mut receive) = timeout(self.config.operation_timeout, async {
            self.connection
                .open_bi()
                .await
                .map_err(transport_error)?
                .await
                .map_err(transport_error)
        })
        .await
        .map_err(|_| WebTransportError::Timeout)??;
        write_frame(&mut send, &request, self.config.operation_timeout).await?;
        let response = timeout(
            self.config.operation_timeout,
            read_sea_unary_frame(&mut receive, limits.max_frame_bytes),
        )
        .await
        .map_err(|_| WebTransportError::Timeout)??;
        let response = decode_response_frame(request_id, &response, limits);
        pending.complete(request_id)?;
        response
    }

    async fn stream_request(
        &self,
        request: protocol::Request,
    ) -> Result<SessionStream<protocol::Response, SeaClientError>, SeaClientError> {
        let pending = self.state.begin(request.stream_role())?;
        let request_id = pending.id();
        let limits = self.sea_limits();
        let request = protocol::encode(
            &protocol::Frame {
                request_id,
                message: request,
            },
            limits,
        )?;
        let (mut send, receive) = timeout(self.config.operation_timeout, async {
            self.connection
                .open_bi()
                .await
                .map_err(transport_error)?
                .await
                .map_err(transport_error)
        })
        .await
        .map_err(|_| WebTransportError::Timeout)??;
        write_frame(&mut send, &request, self.config.operation_timeout).await?;
        Ok(Box::pin(stream::try_unfold(
            (receive, Some(pending)),
            move |(mut receive, mut pending)| async move {
                let Some(bytes) =
                    read_sea_stream_frame(&mut receive, limits.max_frame_bytes).await?
                else {
                    pending
                        .take()
                        .expect("active stream correlation")
                        .complete(request_id)?;
                    return Ok(None);
                };
                let response = decode_response_frame(request_id, &bytes, limits)?;
                Ok(Some((response, (receive, pending))))
            },
        )))
    }

    const fn sea_limits(&self) -> protocol::Limits {
        protocol::Limits {
            max_frame_bytes: self.config.max_frame_bytes,
        }
    }
}

#[async_trait]
impl SeaService for NativeSeaClient {
    type Error = SeaClientError;
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl SeaEventSubscription for NativeSeaClient {
    async fn load(
        &self,
        required: Option<EventPosition>,
    ) -> Result<SessionStream<LoadEvent, Self::Error>, Self::Error> {
        let stream = self
            .stream_request(protocol::Request::Load {
                required: required.map(EventPosition::get),
            })
            .await?;
        Ok(Box::pin(
            stream.map(|result| result.and_then(load_from_wire)),
        ))
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl SeaArchive for NativeSeaClient {
    async fn read(
        &self,
        after: Option<EventPosition>,
        through: Option<EventPosition>,
    ) -> Result<SessionStream<SessionCommittedEvent, Self::Error>, Self::Error> {
        let stream = self
            .stream_request(protocol::Request::Read {
                after: after.map(EventPosition::get),
                through: through.map(EventPosition::get),
            })
            .await?;
        Ok(Box::pin(stream.map(|result| match result? {
            protocol::Response::LoadEvent(event) => session_event_from_wire(*event),
            response => Err(response_error(response)),
        })))
    }

    async fn put_blob(&self, payload: Bytes) -> Result<BlobId, Self::Error> {
        match self
            .request(protocol::Request::PutBlob {
                payload: payload.to_vec(),
            })
            .await?
        {
            protocol::Response::BlobStored { id } => {
                Ok(BlobId::from_bytes(&id).expect("fixed blob identity"))
            }
            response => Err(response_error(response)),
        }
    }

    async fn get_blob(&self, id: BlobId) -> Result<Bytes, Self::Error> {
        match self
            .request(protocol::Request::GetBlob { id: *id.as_bytes() })
            .await?
        {
            protocol::Response::Blob(payload) => Ok(Bytes::from(payload)),
            response => Err(response_error(response)),
        }
    }

    async fn put_directory(
        &self,
        directory: BlobDirectory,
    ) -> Result<BlobDirectoryId, Self::Error> {
        let entries = directory
            .entries()
            .iter()
            .map(|(name, child)| protocol::DirectoryEntry {
                name: name.clone(),
                child: tree_to_wire(*child),
            })
            .collect();
        match self
            .request(protocol::Request::PutDirectory { entries })
            .await?
        {
            protocol::Response::DirectoryStored { id } => {
                Ok(BlobDirectoryId::from_bytes(&id).expect("fixed directory identity"))
            }
            response => Err(response_error(response)),
        }
    }

    async fn get_directory(&self, id: BlobDirectoryId) -> Result<BlobDirectory, Self::Error> {
        match self
            .request(protocol::Request::GetDirectory { id: *id.as_bytes() })
            .await?
        {
            protocol::Response::Directory(entries) => {
                let mut directory = BTreeMap::new();
                for entry in entries {
                    if directory
                        .insert(entry.name, tree_from_wire(entry.child))
                        .is_some()
                    {
                        return Err(SeaClientError::UnexpectedResponse);
                    }
                }
                BlobDirectory::new(directory).map_err(|_| SeaClientError::UnexpectedResponse)
            }
            response => Err(response_error(response)),
        }
    }

    async fn snapshot(&self, id: &SnapshotId) -> Result<Option<PublishedSnapshot>, Self::Error> {
        match self
            .request(protocol::Request::GetSnapshot {
                id: id.as_bytes().to_vec(),
            })
            .await?
        {
            protocol::Response::Snapshot(snapshot) => Ok(snapshot.map(snapshot_from_wire)),
            response => Err(response_error(response)),
        }
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl SeaAuthorSession for NativeSeaClient {
    async fn submit(&self, submission: EventSubmission) -> Result<EventReceipt, Self::Error> {
        match self
            .request(protocol::Request::Submit {
                operation: submission.operation_id.as_bytes().to_vec(),
                reference: submission.reference.map(EventPosition::get),
                event: event_to_wire(&submission.event),
            })
            .await?
        {
            protocol::Response::EventCommitted {
                position,
                durability,
            } => Ok(EventReceipt {
                position: EventPosition::new(position),
                durability: durability_from_wire(durability),
            }),
            response => Err(response_error(response)),
        }
    }

    async fn resolve_submission(
        &self,
        operation_id: &OperationId,
    ) -> Result<Option<EventReceipt>, Self::Error> {
        match self
            .request(protocol::Request::ResolveSubmission {
                operation: operation_id.as_bytes().to_vec(),
            })
            .await?
        {
            protocol::Response::SubmissionResolved {
                position,
                durability,
            } => match (position, durability) {
                (Some(position), Some(durability)) => Ok(Some(EventReceipt {
                    position: EventPosition::new(position),
                    durability: durability_from_wire(durability),
                })),
                (None, None) => Ok(None),
                _ => Err(SeaClientError::UnexpectedResponse),
            },
            response => Err(response_error(response)),
        }
    }

    async fn close(&self) -> Result<(), Self::Error> {
        if self.state.is_closed()? {
            return Ok(());
        }
        match self.request(protocol::Request::Close).await? {
            protocol::Response::Acknowledged => {
                self.state.close()?;
                self.connection.close(CLOSE_CODE, b"Sea session closed");
                Ok(())
            }
            response => Err(response_error(response)),
        }
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl SeaSnapshotCoordinator for NativeSeaClient {
    async fn latest_snapshot(&self) -> Result<Option<PublishedSnapshot>, Self::Error> {
        match self.request(protocol::Request::LatestSnapshot).await? {
            protocol::Response::Snapshot(snapshot) => Ok(snapshot.map(snapshot_from_wire)),
            response => Err(response_error(response)),
        }
    }

    async fn publish_snapshot(
        &self,
        publication: SnapshotPublication,
    ) -> Result<PublishedSnapshot, Self::Error> {
        match self
            .request(protocol::Request::PublishSnapshot {
                operation: publication.operation_id.as_bytes().to_vec(),
                expected_parent: publication
                    .expected_parent
                    .map(|parent| parent.as_bytes().to_vec()),
                at_event: snapshot_position_to_wire(publication.snapshot.at_event),
                root: tree_to_wire(publication.snapshot.root),
            })
            .await?
        {
            protocol::Response::Snapshot(Some(snapshot)) => Ok(snapshot_from_wire(snapshot)),
            response => Err(response_error(response)),
        }
    }

    async fn resolve_snapshot_publication(
        &self,
        operation_id: &OperationId,
    ) -> Result<Option<PublishedSnapshot>, Self::Error> {
        match self
            .request(protocol::Request::ResolveSnapshot {
                operation: operation_id.as_bytes().to_vec(),
            })
            .await?
        {
            protocol::Response::Snapshot(snapshot) => Ok(snapshot.map(snapshot_from_wire)),
            response => Err(response_error(response)),
        }
    }

    async fn subscribe_snapshots(
        &self,
    ) -> Result<SessionStream<PublishedSnapshot, Self::Error>, Self::Error> {
        let stream = self
            .stream_request(protocol::Request::SubscribeSnapshots)
            .await?;
        Ok(Box::pin(stream.map(|result| match result? {
            protocol::Response::Snapshot(Some(snapshot)) => Ok(snapshot_from_wire(snapshot)),
            response => Err(response_error(response)),
        })))
    }
}

fn load_from_wire(response: protocol::Response) -> Result<LoadEvent, SeaClientError> {
    match response {
        protocol::Response::LoadSnapshot(snapshot) => {
            Ok(LoadEvent::Snapshot(snapshot_from_wire(snapshot)))
        }
        protocol::Response::LoadEvent(event) => {
            session_event_from_wire(*event).map(LoadEvent::Event)
        }
        protocol::Response::CaughtUp(head) => Ok(LoadEvent::CaughtUp(head.map(EventPosition::new))),
        response => Err(response_error(response)),
    }
}

fn session_event_from_wire(
    event: protocol::StreamEvent,
) -> Result<SessionCommittedEvent, SeaClientError> {
    Ok(SessionCommittedEvent {
        committed: CommittedEvent {
            position: EventPosition::new(event.position),
            event: event_from_wire(event.event),
        },
        author_id: AuthorId::new(Bytes::from(event.author))
            .map_err(|_| SeaClientError::UnexpectedResponse)?,
        session_id: SessionId::new(Bytes::from(event.session))
            .map_err(|_| SeaClientError::UnexpectedResponse)?,
        operation_id: OperationId::new(Bytes::from(event.operation))
            .map_err(|_| SeaClientError::UnexpectedResponse)?,
        reference: event.reference.map(EventPosition::new),
        minimum_reference: event.minimum_reference.map(EventPosition::new),
    })
}

fn event_from_wire(event: protocol::Event) -> Event {
    Event {
        payload: Bytes::from(event.payload),
        blob_tree: event.blob_tree.map(tree_from_wire),
    }
}

fn event_to_wire(event: &Event) -> protocol::Event {
    protocol::Event {
        payload: event.payload.to_vec(),
        blob_tree: event.blob_tree.map(tree_to_wire),
    }
}

fn tree_from_wire(id: protocol::TreeId) -> BlobTreeId {
    match id {
        protocol::TreeId::Blob(bytes) => {
            BlobTreeId::Blob(BlobId::from_bytes(&bytes).expect("fixed blob identity"))
        }
        protocol::TreeId::Directory(bytes) => BlobTreeId::Directory(
            BlobDirectoryId::from_bytes(&bytes).expect("fixed directory identity"),
        ),
    }
}

fn tree_to_wire(id: BlobTreeId) -> protocol::TreeId {
    match id {
        BlobTreeId::Blob(id) => protocol::TreeId::Blob(*id.as_bytes()),
        BlobTreeId::Directory(id) => protocol::TreeId::Directory(*id.as_bytes()),
    }
}

fn snapshot_from_wire(snapshot: protocol::Snapshot) -> PublishedSnapshot {
    PublishedSnapshot {
        id: SnapshotId::from_bytes(Bytes::from(snapshot.id)),
        parent: snapshot
            .parent
            .map(|parent| SnapshotId::from_bytes(Bytes::from(parent))),
        snapshot: Snapshot {
            at_event: match snapshot.at_event {
                protocol::SnapshotPosition::Initial => SnapshotPosition::Initial,
                protocol::SnapshotPosition::At(position) => {
                    SnapshotPosition::At(EventPosition::new(position))
                }
            },
            root: tree_from_wire(snapshot.root),
        },
    }
}

fn snapshot_position_to_wire(position: SnapshotPosition) -> protocol::SnapshotPosition {
    match position {
        SnapshotPosition::Initial => protocol::SnapshotPosition::Initial,
        SnapshotPosition::At(position) => protocol::SnapshotPosition::At(position.get()),
    }
}

const fn durability_from_wire(value: protocol::WireDurability) -> Durability {
    match value {
        protocol::WireDurability::Memory => Durability::Memory,
        protocol::WireDurability::Buffered => Durability::Buffered,
        protocol::WireDurability::Durable => Durability::Durable,
    }
}

fn response_error(response: protocol::Response) -> SeaClientError {
    match response {
        protocol::Response::Error { kind, message } => SeaClientError::Service(kind, message),
        _ => SeaClientError::UnexpectedResponse,
    }
}

fn decode_response_frame(
    request_id: u64,
    bytes: &[u8],
    limits: protocol::Limits,
) -> Result<protocol::Response, SeaClientError> {
    let frame = protocol::decode::<protocol::Frame<protocol::Response>>(bytes, limits)?;
    if frame.request_id != request_id {
        return Err(SeaClientError::UnexpectedResponse);
    }
    match frame.message {
        protocol::Response::Error { kind, message } => Err(SeaClientError::Service(kind, message)),
        response => Ok(response),
    }
}

#[cfg(test)]
mod tests {
    use super::{SeaClientError, decode_response_frame, load_from_wire};
    use crate::protocol::{self, Frame, Limits, Response};

    #[test]
    fn response_frame_rejects_mismatched_request_id() {
        let limits = Limits::default();
        let bytes = protocol::encode(
            &Frame {
                request_id: 8,
                message: Response::Acknowledged,
            },
            limits,
        )
        .expect("response encoding");
        assert!(matches!(
            decode_response_frame(7, &bytes, limits),
            Err(SeaClientError::UnexpectedResponse)
        ));
    }

    #[test]
    fn response_frame_preserves_service_error() {
        let limits = Limits::default();
        let bytes = protocol::encode(
            &Frame {
                request_id: 7,
                message: Response::Error {
                    kind: protocol::ErrorKind::Conflict,
                    message: "conflict".to_owned(),
                },
            },
            limits,
        )
        .expect("response encoding");
        assert!(matches!(
            decode_response_frame(7, &bytes, limits),
            Err(SeaClientError::Service(protocol::ErrorKind::Conflict, message))
                if message == "conflict"
        ));
    }

    #[test]
    fn load_rejects_unexpected_response_kind() {
        assert!(matches!(
            load_from_wire(Response::Acknowledged),
            Err(SeaClientError::UnexpectedResponse)
        ));
    }
}
