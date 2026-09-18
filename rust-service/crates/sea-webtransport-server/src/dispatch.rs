//! Typed Sea protocol dispatch over an already-open session.

use std::{collections::BTreeMap, sync::Arc};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{StreamExt as _, stream};
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeId, ClassifiedError, ErrorKind, Event,
    EventPosition, MonitoredStreamItem, MonitoredStreamStatus,
    archive::{
        EventSubmission, OperationId, SeaService,
        SnapshotParticipation as ArchiveSnapshotParticipation,
    },
    next::{
        LoadStart, Snapshot, StorageHandle,
        session::{SeaArchive, SeaAuthorSession, SeaSnapshotCoordinator},
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
    S: SeaArchive + SeaAuthorSession + SeaSnapshotCoordinator + Send + Sync + 'static,
{
    async fn connection_closed(&self, _allow_reconnect_grace: bool) {
        let _ = self.session.close().await;
    }

    async fn open_event_stream(
        &self,
        _request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response> {
        Err(invalid("event stream must be opened by the service host"))
    }

    async fn event_stream(
        &self,
        resume_after: Option<u64>,
    ) -> Result<SeaResponseStream, protocol::Response> {
        let load = self
            .session
            .load(resume_after.map_or(LoadStart::LatestSnapshot, |position| {
                LoadStart::ReplayAtLeastAllAfter(EventPosition::new(position))
            }))
            .await
            .map_err(error_response)?;
        let snapshot = stream::iter(
            load.snapshot
                .map(|snapshot| protocol::Response::LoadSnapshot(snapshot_to_wire(&snapshot))),
        );
        Ok(Box::pin(snapshot.chain(load.events.map(
            |item| match item {
                Ok(MonitoredStreamItem::Item(event)) => session_event_to_wire(&event),
                Ok(MonitoredStreamItem::Progress(progress)) => protocol::Response::StreamProgress {
                    previous: progress.previous.map(EventPosition::get),
                    latest_known: progress.latest_known.map(EventPosition::get),
                    status: stream_status_to_wire(progress.status),
                },
                Err(error) => error_response(error),
            },
        ))))
    }

    async fn author_request(&self, request: protocol::Request) -> protocol::Response {
        match request {
            protocol::Request::Submit { .. }
            | protocol::Request::ResolveSubmission { .. }
            | protocol::Request::Close => match self.request_inner(request).await {
                Ok(response) | Err(response) => response,
            },
            _ => invalid("request is not valid on an open author stream"),
        }
    }

    async fn snapshot_stream(
        &self,
        request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response> {
        let protocol::Request::OpenSnapshotStream { participation, .. } = request else {
            return Err(invalid("snapshot stream requires OpenSnapshotStream"));
        };
        let stream = self
            .session
            .coordinate_snapshots(snapshot_participation_from_wire(participation))
            .await
            .map_err(error_response)?;
        Ok(Box::pin(stream.map(|item| match item {
            Ok(state) => protocol::Response::SnapshotCoordination {
                latest: state.latest.map(EventPosition::get),
                fence: state.fence,
            },
            Err(error) => error_response(error),
        })))
    }

    async fn snapshot_request(&self, request: protocol::Request) -> protocol::Response {
        match request {
            protocol::Request::Close => self
                .session
                .revoke_snapshot_publisher()
                .await
                .map_or_else(error_response, |()| protocol::Response::Acknowledged),
            protocol::Request::PublishSnapshot {
                fence,
                expected_parent,
                at_event,
                root,
            } => {
                match self
                    .publish_snapshot(fence, expected_parent, at_event, root)
                    .await
                {
                    Ok(response) | Err(response) => response,
                }
            }
            protocol::Request::LatestSnapshot => match self.request_inner(request).await {
                Ok(response) | Err(response) => response,
            },
            _ => invalid("request is not valid on an open snapshot stream"),
        }
    }

    async fn revoke_snapshot_publisher(&self) {
        let _ = self.session.revoke_snapshot_publisher().await;
    }

    async fn open_content_stream(&self, request: protocol::Request) -> protocol::Response {
        if matches!(request, protocol::Request::OpenContentStream { .. }) {
            protocol::Response::Acknowledged
        } else {
            invalid("content stream requires OpenContentStream")
        }
    }

    async fn content_request(
        &self,
        request: protocol::Request,
    ) -> Result<SeaResponseStream, protocol::Response> {
        if let protocol::Request::Read { after, stop_after } = request {
            let stream = self.session.read(
                after.map(EventPosition::new),
                stop_after.map(EventPosition::new),
            );
            return Ok(Box::pin(stream.map(|item| match item {
                Ok(MonitoredStreamItem::Item(event)) => session_event_to_wire(&event),
                Ok(MonitoredStreamItem::Progress(progress)) => protocol::Response::StreamProgress {
                    previous: progress.previous.map(EventPosition::get),
                    latest_known: progress.latest_known.map(EventPosition::get),
                    status: stream_status_to_wire(progress.status),
                },
                Err(error) => error_response(error),
            })));
        }
        self.request_inner(request)
            .await
            .map(|response| Box::pin(stream::once(async move { response })) as SeaResponseStream)
    }
}

const fn stream_status_to_wire(status: MonitoredStreamStatus) -> protocol::StreamStatus {
    match status {
        MonitoredStreamStatus::StreamingBacklog => protocol::StreamStatus::StreamingBacklog,
        MonitoredStreamStatus::AwaitingNewItems => protocol::StreamStatus::AwaitingNewItems,
        MonitoredStreamStatus::FallenBehind => protocol::StreamStatus::FallenBehind,
    }
}

impl<S> SessionDispatcher<S>
where
    S: SeaArchive + SeaAuthorSession + SeaSnapshotCoordinator,
{
    /// Resolves both dependency identities before invoking conditional publication.
    async fn publish_snapshot(
        &self,
        fence: Option<u64>,
        expected_parent: Option<u64>,
        at_event: u64,
        root: protocol::TreeId,
    ) -> Result<protocol::Response, protocol::Response> {
        let root = self
            .session
            .resolve_tree(tree_from_wire(root))
            .await
            .map_err(error_response)?
            .ok_or_else(|| invalid("snapshot tree is unavailable"))?;
        let at_event = self
            .session
            .resolve_position(EventPosition::new(at_event))
            .await
            .map_err(error_response)?
            .ok_or_else(|| invalid("snapshot event is unavailable"))?;
        let snapshot = self
            .session
            .publish_snapshot(
                expected_parent.map(EventPosition::new),
                fence,
                Snapshot { root, at_event },
            )
            .await
            .map_err(error_response)?;
        Ok(protocol::Response::Snapshot(Some(snapshot_to_wire(
            &snapshot,
        ))))
    }

    #[allow(clippy::too_many_lines)]
    async fn request_inner(
        &self,
        request: protocol::Request,
    ) -> Result<protocol::Response, protocol::Response> {
        match request {
            request @ (protocol::Request::PutBlob { .. }
            | protocol::Request::GetBlob { .. }
            | protocol::Request::PutDirectory { .. }
            | protocol::Request::GetDirectory { .. }) => self.content_value(request).await,
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
                    position: receipt.get(),
                })
            }
            protocol::Request::ResolveSubmission { operation } => {
                let receipt = self
                    .session
                    .resolve_submission(&operation_id(operation)?)
                    .await
                    .map_err(error_response)?;
                Ok(protocol::Response::SubmissionResolved {
                    position: receipt.map(EventPosition::get),
                })
            }
            protocol::Request::GetSnapshot { id } => {
                let snapshot = self
                    .session
                    .get_snapshot(LoadStart::ReplayAtLeastAllAfter(EventPosition::new(id)))
                    .await
                    .map_err(error_response)?;
                Ok(protocol::Response::Snapshot(
                    snapshot.as_ref().map(snapshot_to_wire),
                ))
            }
            protocol::Request::LatestSnapshot => {
                let snapshot = self
                    .session
                    .get_snapshot(LoadStart::LatestSnapshot)
                    .await
                    .map_err(error_response)?;
                Ok(protocol::Response::Snapshot(
                    snapshot.as_ref().map(snapshot_to_wire),
                ))
            }
            protocol::Request::Close => {
                self.session.close().await.map_err(error_response)?;
                Ok(protocol::Response::Acknowledged)
            }
            protocol::Request::OpenEventStream { .. }
            | protocol::Request::OpenAuthorStream { .. }
            | protocol::Request::OpenSnapshotStream { .. }
            | protocol::Request::PublishSnapshot { .. }
            | protocol::Request::OpenContentStream { .. }
            | protocol::Request::Read { .. } => {
                Err(invalid("request is not valid for this logical stream"))
            }
        }
    }

    async fn content_value(
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
                let BlobTreeId::Blob(id) = id.id() else {
                    return Err(invalid("blob store returned a directory"));
                };
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
                let BlobTreeId::Directory(id) = id.id() else {
                    return Err(invalid("directory store returned a blob"));
                };
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

const fn snapshot_participation_from_wire(
    participation: protocol::SnapshotParticipation,
) -> ArchiveSnapshotParticipation {
    match participation {
        protocol::SnapshotParticipation::ReadOnly => ArchiveSnapshotParticipation::ReadOnly,
        protocol::SnapshotParticipation::SeaSelected => ArchiveSnapshotParticipation::SeaSelected,
        protocol::SnapshotParticipation::ClientSelected => {
            ArchiveSnapshotParticipation::ClientSelected
        }
    }
}

fn snapshot_to_wire<
    BlobHandle: StorageHandle<Id = BlobTreeId>,
    EventHandle: StorageHandle<Id = EventPosition>,
>(
    snapshot: &Snapshot<BlobHandle, EventHandle>,
) -> protocol::Snapshot {
    protocol::Snapshot {
        at_event: snapshot.at_event.id().get(),
        root: tree_to_wire(snapshot.root.id()),
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
    use sea_core::next::SeaStorage as _;
    use sea_memory::MemoryStorage;
    use sea_sequencer::next::LocalSequencer;

    use super::SessionDispatcher;
    use sea_webtransport::protocol;

    use crate::SeaConnectionService;

    #[tokio::test]
    async fn dispatches_typed_role_operations() {
        let (_, view) = MemoryStorage::new().create_view().await.unwrap();
        let sequencer = LocalSequencer::<MemoryStorage>::recover(view)
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

        let mut stored = dispatcher
            .content_request(protocol::Request::PutBlob {
                payload: b"content".to_vec(),
            })
            .await
            .expect("blob upload response");
        let protocol::Response::BlobStored { id } = dispatcher
            .content_request(protocol::Request::PutBlob {
                payload: b"content-2".to_vec(),
            })
            .await
            .expect("second blob upload response")
            .next()
            .await
            .expect("second blob identity")
        else {
            panic!("blob upload should return its identity");
        };
        assert!(matches!(
            stored.next().await,
            Some(protocol::Response::BlobStored { .. })
        ));
        let mut fetched = dispatcher
            .content_request(protocol::Request::GetBlob { id })
            .await
            .expect("blob fetch response");
        let protocol::Response::Blob(payload) = fetched.next().await.expect("blob fetch payload")
        else {
            panic!("blob fetch should return bytes");
        };
        assert_eq!(payload, b"content-2");

        let protocol::Response::EventCommitted { position } = dispatcher
            .author_request(protocol::Request::Submit {
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
        assert!(position > 0);
        assert_eq!(
            dispatcher
                .author_request(protocol::Request::ResolveSubmission {
                    operation: b"operation".to_vec(),
                })
                .await,
            protocol::Response::SubmissionResolved {
                position: Some(position),
            }
        );

        let mut load = dispatcher.event_stream(None).await.expect("load stream");
        assert!(matches!(
            load.next().await,
            Some(protocol::Response::StreamProgress {
                status: protocol::StreamStatus::StreamingBacklog,
                ..
            })
        ));
        assert!(matches!(
            load.next().await,
            Some(protocol::Response::LoadEvent(event)) if event.position == position
        ));
        assert!(matches!(
            load.next().await,
            Some(protocol::Response::StreamProgress {
                previous: Some(previous),
                latest_known: Some(latest_known),
                status: protocol::StreamStatus::AwaitingNewItems,
            }) if previous == position && latest_known == position
        ));
    }
}
