//! Typed Sea protocol dispatch over an already-open session.

use std::{collections::BTreeMap, sync::Arc};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::StreamExt as _;
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError, Durability, ErrorKind,
    Event, EventPosition, SnapshotId,
    archive::{
        EventSubmission, LoadEvent, OperationId, PublishedSnapshot, SeaArchive, SeaAuthorSession,
        SeaEventSubscription, SeaService, SeaSnapshotCoordinator, SeaSnapshotPublisher,
        Snapshot as ArchiveSnapshot, SnapshotPosition as ArchiveSnapshotPosition,
        SnapshotPublication,
    },
};

use sea_webtransport::protocol;

use crate::{SeaConnectionService, SeaResponseStream};

/// Adapts narrow Sea service responsibilities to typed wire requests.
pub struct SessionDispatcher<S: SeaService> {
    session: Arc<S>,
}

impl<S: SeaService> SessionDispatcher<S> {
    /// Wraps one already-open session.
    #[must_use]
    pub const fn new(session: Arc<S>) -> Self {
        Self { session }
    }
}

#[async_trait]
impl<S> SeaConnectionService for SessionDispatcher<S>
where
    S: SeaArchive
        + SeaAuthorSession
        + SeaEventSubscription
        + SeaSnapshotCoordinator
        + SeaSnapshotPublisher
        + Send
        + Sync
        + 'static,
{
    async fn request(&self, request: protocol::Request) -> protocol::Response {
        match self.request_inner(request).await {
            Ok(response) | Err(response) => response,
        }
    }

    async fn stream(
        &self,
        request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response> {
        match request {
            protocol::Request::Read { after, through } => {
                let stream = self
                    .session
                    .read(
                        after.map(EventPosition::new),
                        through.map(EventPosition::new),
                    )
                    .await
                    .map_err(error_response)?;
                Ok(Box::pin(stream.map(|item| match item {
                    Ok(event) => session_event_to_wire(&event),
                    Err(error) => error_response(error),
                })))
            }
            protocol::Request::Load { required } => {
                let stream = self
                    .session
                    .load(required.map(EventPosition::new))
                    .await
                    .map_err(error_response)?;
                Ok(Box::pin(stream.map(|item| match item {
                    Ok(LoadEvent::Snapshot(snapshot)) => {
                        protocol::Response::LoadSnapshot(snapshot_to_wire(snapshot))
                    }
                    Ok(LoadEvent::Event(event)) => session_event_to_wire(&event),
                    Ok(LoadEvent::CaughtUp(head)) => {
                        protocol::Response::CaughtUp(head.map(EventPosition::get))
                    }
                    Err(error) => error_response(error),
                })))
            }
            protocol::Request::SubscribeSnapshots => {
                let stream = self
                    .session
                    .subscribe_snapshots()
                    .await
                    .map_err(error_response)?;
                Ok(Box::pin(stream.map(|item| match item {
                    Ok(snapshot) => protocol::Response::Snapshot(Some(snapshot_to_wire(snapshot))),
                    Err(error) => error_response(error),
                })))
            }
            _ => Err(protocol::Response::Error {
                kind: protocol::ErrorKind::Rejected,
                message: "request does not open a response stream".to_owned(),
            }),
        }
    }

    async fn event_stream(
        &self,
        resume_after: Option<u64>,
    ) -> Result<SeaResponseStream, protocol::Response> {
        let stream = self
            .session
            .load(resume_after.map(EventPosition::new))
            .await
            .map_err(error_response)?;
        Ok(Box::pin(stream.map(|item| match item {
            Ok(LoadEvent::Snapshot(snapshot)) => {
                protocol::Response::LoadSnapshot(snapshot_to_wire(snapshot))
            }
            Ok(LoadEvent::Event(event)) => session_event_to_wire(&event),
            Ok(LoadEvent::CaughtUp(head)) => {
                protocol::Response::CaughtUp(head.map(EventPosition::get))
            }
            Err(error) => error_response(error),
        })))
    }

    async fn author_request(&self, request: protocol::Request) -> protocol::Response {
        match request {
            protocol::Request::Submit { .. }
            | protocol::Request::ResolveSubmission { .. }
            | protocol::Request::Close => self.request(request).await,
            _ => invalid("request is not valid on an open author stream"),
        }
    }

    async fn snapshot_stream(
        &self,
        request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response> {
        let protocol::Request::OpenSnapshotStream {
            eligible, willing, ..
        } = request
        else {
            return Err(invalid("snapshot stream requires OpenSnapshotStream"));
        };
        let stream = self
            .session
            .coordinate_snapshots(eligible, willing)
            .await
            .map_err(error_response)?;
        Ok(Box::pin(stream.map(|item| match item {
            Ok(state) => protocol::Response::SnapshotCoordination {
                latest: state.latest.map(snapshot_to_wire),
                fence: state.fence,
            },
            Err(error) => error_response(error),
        })))
    }

    async fn snapshot_request(&self, request: protocol::Request) -> protocol::Response {
        match request {
            protocol::Request::PublishNominatedSnapshot {
                fence,
                operation,
                expected_parent,
                at_event,
                root,
            } => match operation_id(operation) {
                Ok(operation_id) => self
                    .session
                    .publish_nominated_snapshot(
                        fence,
                        SnapshotPublication {
                            operation_id,
                            expected_parent: expected_parent
                                .map(|parent| SnapshotId::from_bytes(Bytes::from(parent))),
                            snapshot: ArchiveSnapshot {
                                at_event: snapshot_position_from_wire(at_event),
                                root: tree_from_wire(root),
                            },
                        },
                    )
                    .await
                    .map_or_else(error_response, |snapshot| {
                        protocol::Response::Snapshot(Some(snapshot_to_wire(snapshot)))
                    }),
                Err(error) => error,
            },
            protocol::Request::LatestSnapshot | protocol::Request::ResolveSnapshot { .. } => {
                self.request(request).await
            }
            _ => invalid("request is not valid on an open snapshot stream"),
        }
    }

    async fn revoke_snapshot_publisher(&self) {
        let _ = self.session.revoke_snapshot_publisher().await;
    }
}

impl<S> SessionDispatcher<S>
where
    S: SeaArchive
        + SeaAuthorSession
        + SeaEventSubscription
        + SeaSnapshotCoordinator
        + SeaSnapshotPublisher,
{
    #[allow(clippy::too_many_lines)]
    async fn request_inner(
        &self,
        request: protocol::Request,
    ) -> Result<protocol::Response, protocol::Response> {
        match request {
            request @ (protocol::Request::PutBlob { .. }
            | protocol::Request::GetBlob { .. }
            | protocol::Request::PutDirectory { .. }
            | protocol::Request::GetDirectory { .. }) => self.content_request(request).await,
            protocol::Request::Submit {
                operation,
                reference,
                event,
            } => {
                let receipt = self
                    .session
                    .submit(EventSubmission {
                        operation_id: operation_id(operation)?,
                        reference: reference.map(EventPosition::new),
                        event: event_from_wire(event),
                    })
                    .await
                    .map_err(error_response)?;
                Ok(protocol::Response::EventCommitted {
                    position: receipt.position.get(),
                    durability: durability_to_wire(receipt.durability),
                })
            }
            protocol::Request::ResolveSubmission { operation } => {
                let receipt = self
                    .session
                    .resolve_submission(&operation_id(operation)?)
                    .await
                    .map_err(error_response)?;
                Ok(protocol::Response::SubmissionResolved {
                    position: receipt.as_ref().map(|receipt| receipt.position.get()),
                    durability: receipt
                        .as_ref()
                        .map(|receipt| durability_to_wire(receipt.durability)),
                })
            }
            protocol::Request::GetSnapshot { id } => {
                let snapshot = self
                    .session
                    .snapshot(&SnapshotId::from_bytes(Bytes::from(id)))
                    .await
                    .map_err(error_response)?;
                Ok(protocol::Response::Snapshot(snapshot.map(snapshot_to_wire)))
            }
            protocol::Request::LatestSnapshot => {
                let snapshot = self
                    .session
                    .latest_snapshot()
                    .await
                    .map_err(error_response)?;
                Ok(protocol::Response::Snapshot(snapshot.map(snapshot_to_wire)))
            }
            protocol::Request::PublishSnapshot {
                operation,
                expected_parent,
                at_event,
                root,
            } => {
                let snapshot = self
                    .session
                    .publish_snapshot(SnapshotPublication {
                        operation_id: operation_id(operation)?,
                        expected_parent: expected_parent
                            .map(|parent| SnapshotId::from_bytes(Bytes::from(parent))),
                        snapshot: ArchiveSnapshot {
                            at_event: snapshot_position_from_wire(at_event),
                            root: tree_from_wire(root),
                        },
                    })
                    .await
                    .map_err(error_response)?;
                Ok(protocol::Response::Snapshot(Some(snapshot_to_wire(
                    snapshot,
                ))))
            }
            protocol::Request::ResolveSnapshot { operation } => {
                let snapshot = self
                    .session
                    .resolve_snapshot_publication(&operation_id(operation)?)
                    .await
                    .map_err(error_response)?;
                Ok(protocol::Response::Snapshot(snapshot.map(snapshot_to_wire)))
            }
            protocol::Request::Close => {
                self.session.close().await.map_err(error_response)?;
                Ok(protocol::Response::Acknowledged)
            }
            protocol::Request::CreateArchive { .. }
            | protocol::Request::OpenSession { .. }
            | protocol::Request::OpenEventStream { .. }
            | protocol::Request::OpenAuthorStream { .. }
            | protocol::Request::OpenSnapshotStream { .. }
            | protocol::Request::PublishNominatedSnapshot { .. }
            | protocol::Request::Read { .. }
            | protocol::Request::Load { .. }
            | protocol::Request::SubscribeSnapshots => Err(invalid(
                "request is not valid for an open-session unary operation",
            )),
        }
    }

    async fn content_request(
        &self,
        request: protocol::Request,
    ) -> Result<protocol::Response, protocol::Response> {
        match request {
            protocol::Request::PutBlob { payload } => {
                let id = self
                    .session
                    .put_blob(Bytes::from(payload))
                    .await
                    .map_err(error_response)?;
                Ok(protocol::Response::BlobStored { id: *id.as_bytes() })
            }
            protocol::Request::GetBlob { id } => {
                let payload = self
                    .session
                    .get_blob(BlobId::from_bytes(&id).expect("fixed blob identity"))
                    .await
                    .map_err(error_response)?;
                Ok(protocol::Response::Blob(payload.to_vec()))
            }
            protocol::Request::PutDirectory { entries } => {
                let mut directory = BTreeMap::new();
                for entry in entries {
                    if directory
                        .insert(entry.name, tree_from_wire(entry.child))
                        .is_some()
                    {
                        return Err(invalid("directory contains a duplicate name"));
                    }
                }
                let directory =
                    BlobDirectory::new(directory).map_err(|error| invalid(&error.to_string()))?;
                let id = self
                    .session
                    .put_directory(directory)
                    .await
                    .map_err(error_response)?;
                Ok(protocol::Response::DirectoryStored { id: *id.as_bytes() })
            }
            protocol::Request::GetDirectory { id } => {
                let directory = self
                    .session
                    .get_directory(
                        BlobDirectoryId::from_bytes(&id).expect("fixed directory identity"),
                    )
                    .await
                    .map_err(error_response)?;
                Ok(protocol::Response::Directory(
                    directory
                        .entries()
                        .iter()
                        .map(|(name, child)| protocol::DirectoryEntry {
                            name: name.clone(),
                            child: tree_to_wire(*child),
                        })
                        .collect(),
                ))
            }
            _ => unreachable!("content request was filtered by the caller"),
        }
    }
}

fn session_event_to_wire(event: &sea_core::archive::SessionCommittedEvent) -> protocol::Response {
    protocol::Response::LoadEvent(Box::new(protocol::StreamEvent {
        position: event.committed.position.get(),
        author: event.author_id.as_bytes().to_vec(),
        session: event.session_id.as_bytes().to_vec(),
        operation: event.operation_id.as_bytes().to_vec(),
        reference: event.reference.map(EventPosition::get),
        minimum_reference: event.minimum_reference.map(EventPosition::get),
        event: event_to_wire(&event.committed.event),
    }))
}

fn operation_id(value: Vec<u8>) -> Result<OperationId, protocol::Response> {
    OperationId::new(Bytes::from(value)).map_err(|_| invalid("operation identity is empty"))
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

fn snapshot_position_from_wire(position: protocol::SnapshotPosition) -> ArchiveSnapshotPosition {
    match position {
        protocol::SnapshotPosition::Initial => ArchiveSnapshotPosition::Initial,
        protocol::SnapshotPosition::At(position) => {
            ArchiveSnapshotPosition::At(EventPosition::new(position))
        }
    }
}

fn snapshot_to_wire(snapshot: PublishedSnapshot) -> protocol::Snapshot {
    protocol::Snapshot {
        id: snapshot.id.as_bytes().to_vec(),
        parent: snapshot.parent.map(|parent| parent.as_bytes().to_vec()),
        at_event: match snapshot.snapshot.at_event {
            ArchiveSnapshotPosition::Initial => protocol::SnapshotPosition::Initial,
            ArchiveSnapshotPosition::At(position) => protocol::SnapshotPosition::At(position.get()),
        },
        root: tree_to_wire(snapshot.snapshot.root),
    }
}

const fn durability_to_wire(durability: Durability) -> protocol::WireDurability {
    match durability {
        Durability::Memory => protocol::WireDurability::Memory,
        Durability::Buffered => protocol::WireDurability::Buffered,
        Durability::Durable => protocol::WireDurability::Durable,
    }
}

fn invalid(message: &str) -> protocol::Response {
    protocol::Response::Error {
        kind: protocol::ErrorKind::Invalid,
        message: message.to_owned(),
    }
}

fn error_response(error: impl ClassifiedError) -> protocol::Response {
    let kind = error.kind();
    let message = error.to_string();
    drop(error);
    protocol::Response::Error {
        kind: match kind {
            ErrorKind::InvalidPosition => protocol::ErrorKind::Invalid,
            ErrorKind::StalePosition => protocol::ErrorKind::Stale,
            ErrorKind::Conflict => protocol::ErrorKind::Conflict,
            ErrorKind::Rejected => protocol::ErrorKind::Rejected,
            ErrorKind::Ambiguous => protocol::ErrorKind::Ambiguous,
            ErrorKind::Unavailable => protocol::ErrorKind::Unavailable,
            ErrorKind::Corrupt => protocol::ErrorKind::Corrupt,
        },
        message,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use bytes::Bytes;
    use futures_util::StreamExt as _;
    use sea_core::archive::{AuthorId, SessionId};
    use sea_memory::MemoryStream;
    use sea_sequencer::session::LocalSequencer;

    use super::SessionDispatcher;
    use sea_webtransport::protocol;

    use crate::SeaConnectionService;

    #[tokio::test]
    async fn dispatches_typed_operations_and_load_streams() {
        let sequencer = LocalSequencer::recover(Arc::new(MemoryStream::new()))
            .await
            .unwrap();
        let session = sequencer
            .open_session(
                AuthorId::new(Bytes::from_static(b"author")).unwrap(),
                SessionId::new(Bytes::from_static(b"session")).unwrap(),
                None,
            )
            .await
            .unwrap();
        let dispatcher = SessionDispatcher::new(Arc::new(session));

        let protocol::Response::BlobStored { id } = dispatcher
            .request(protocol::Request::PutBlob {
                payload: b"content".to_vec(),
            })
            .await
        else {
            panic!("blob upload should return its identity");
        };
        let protocol::Response::Blob(payload) =
            dispatcher.request(protocol::Request::GetBlob { id }).await
        else {
            panic!("blob fetch should return bytes");
        };
        assert_eq!(payload, b"content");

        let protocol::Response::EventCommitted {
            position,
            durability,
        } = dispatcher
            .request(protocol::Request::Submit {
                operation: b"operation".to_vec(),
                reference: None,
                event: protocol::Event {
                    payload: b"event".to_vec(),
                    blob_tree: None,
                },
            })
            .await
        else {
            panic!("submission should commit");
        };
        assert_eq!(durability, protocol::WireDurability::Memory);
        assert!(position > 0);
        assert_eq!(
            dispatcher
                .request(protocol::Request::ResolveSubmission {
                    operation: b"operation".to_vec(),
                })
                .await,
            protocol::Response::SubmissionResolved {
                position: Some(position),
                durability: Some(protocol::WireDurability::Memory)
            }
        );

        let mut load = dispatcher
            .stream(protocol::Request::Load { required: None })
            .await
            .expect("load stream");
        assert!(matches!(
            load.next().await,
            Some(protocol::Response::LoadEvent(event)) if event.position == position
        ));
        assert!(matches!(
            load.next().await,
            Some(protocol::Response::CaughtUp(Some(_)))
        ));
    }
}
