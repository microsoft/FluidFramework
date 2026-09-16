//! Native certificate-pinned [`SeaSession`] client.

use std::{collections::BTreeMap, error::Error, fmt};

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
use tokio::{sync::Mutex, time::timeout};
use wtransport::tls::Sha256Digest;

use crate::{
    TransportConfig, WebTransportError,
    client::{Client, ClientError, ClientStateError, EventStream},
    connect_once, protocol,
    transport::native::{NativeBidirectionalStream, NativeTransport},
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
            ClientStateError::Disconnected => WebTransportError::Disconnected.into(),
            ClientStateError::Protocol(error) => error.into(),
            ClientStateError::Poisoned => Self::Transport(WebTransportError::Transport(
                "shared client state is unavailable".to_owned(),
            )),
        }
    }
}

impl From<ClientError<WebTransportError>> for SeaClientError {
    fn from(error: ClientError<WebTransportError>) -> Self {
        match error {
            ClientError::State(error) => error.into(),
            ClientError::Protocol(error) => error.into(),
            ClientError::Transport(error) => error.into(),
            ClientError::ResponseEnded => WebTransportError::Disconnected.into(),
            ClientError::UnexpectedResponse(response) => response_error(response),
        }
    }
}

/// Native WebTransport client bound to one open Sea archive session.
pub struct NativeSeaClient {
    client: Client<NativeTransport>,
    event_stream: Mutex<Option<EventStream<NativeBidirectionalStream>>>,
    resume_after: Option<EventPosition>,
    operation_timeout: std::time::Duration,
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
        let client = Client::new(
            NativeTransport::new(endpoint, connection),
            protocol::Limits {
                max_frame_bytes: config.max_frame_bytes,
            },
        );
        let resume_after = open.reference;
        let event_stream = timeout(
            config.operation_timeout,
            client.open_event_stream(protocol::Request::OpenEventStream {
                version: protocol::PROTOCOL_VERSION,
                archive: open.archive.to_vec(),
                intent: open.intent,
                author: open.author.as_bytes().to_vec(),
                session: open.session.as_bytes().to_vec(),
                resume_after: resume_after.map(EventPosition::get),
            }),
        )
        .await
        .map_err(|_| WebTransportError::Timeout)??;
        Ok(Self {
            client,
            event_stream: Mutex::new(Some(event_stream)),
            resume_after,
            operation_timeout: config.operation_timeout,
        })
    }

    async fn request(
        &self,
        request: protocol::Request,
    ) -> Result<protocol::Response, SeaClientError> {
        timeout(self.operation_timeout, self.client.request(request))
            .await
            .map_err(|_| WebTransportError::Timeout)?
            .map_err(Into::into)
    }

    async fn stream_request(
        &self,
        request: protocol::Request,
    ) -> Result<SessionStream<protocol::Response, SeaClientError>, SeaClientError> {
        let responses = timeout(self.operation_timeout, self.client.request_stream(request))
            .await
            .map_err(|_| WebTransportError::Timeout)??;
        Ok(Box::pin(stream::try_unfold(
            responses,
            |mut responses| async move {
                Ok(responses
                    .next()
                    .await
                    .map_err(SeaClientError::from)?
                    .map(|response| (response, responses)))
            },
        )))
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
        if required != self.resume_after {
            return Err(SeaClientError::UnexpectedResponse);
        }
        let responses = self
            .event_stream
            .lock()
            .await
            .take()
            .ok_or(SeaClientError::UnexpectedResponse)?
            .into_responses();
        let stream: SessionStream<protocol::Response, SeaClientError> =
            Box::pin(stream::try_unfold(responses, |mut responses| async move {
                Ok(responses
                    .next()
                    .await
                    .map_err(SeaClientError::from)?
                    .map(|response| (response, responses)))
            }));
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
        if self.client.is_closed()? {
            return Ok(());
        }
        match self.request(protocol::Request::Close).await? {
            protocol::Response::Acknowledged => {
                self.client.close()?;
                self.client.disconnect()?;
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

#[cfg(test)]
mod tests {
    use super::{SeaClientError, load_from_wire};
    use crate::protocol::Response;

    #[test]
    fn load_rejects_unexpected_response_kind() {
        assert!(matches!(
            load_from_wire(Response::Acknowledged),
            Err(SeaClientError::UnexpectedResponse)
        ));
    }
}
