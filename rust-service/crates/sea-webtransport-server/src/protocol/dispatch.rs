//! Sea protocol dispatch over an already-open typed session.

use std::{collections::BTreeMap, sync::Arc};

use async_trait::async_trait;
use bytes::Bytes;
use futures_util::{StreamExt as _, stream};
use sea_core::{
    BlobDirectory, BlobDirectoryId, BlobId, BlobTreeBodyItem, BlobTreeId, Event, EventPosition,
    MonitoredStreamItem, MonitoredStreamStatus,
    archive::{EventSubmission, SnapshotParticipation as ArchiveSnapshotParticipation},
    session::{SeaArchive, SeaAuthorSession, SeaSnapshotCoordinator},
    storage::{LoadStart, Snapshot, StorageHandle},
};

use sea_webtransport::protocol;

use super::{
    SeaConnectionService, SeaContentResponse, SeaContentStream, SeaLoadStreams, SeaResponseStream,
    error_response,
};

/// Dispatches requests to one already-open session, never a connection's replacement session.
/// The connection host validates authority before handing this dispatcher to a logical stream.
pub struct SessionDispatcher<S: sea_core::SeaService> {
    session: Arc<S>,
}

impl<S: sea_core::SeaService> SessionDispatcher<S> {
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
    async fn bind_session(
        self: Arc<Self>,
        _authority: &[u8],
    ) -> Result<Arc<dyn SeaConnectionService>, protocol::Response> {
        Err(invalid(
            "session dispatcher cannot admit connection streams",
        ))
    }

    async fn connection_closed(&self, _allow_reconnect_grace: bool) {
        let _ = self.session.close().await;
    }

    async fn open_event_stream(
        &self,
        _request: protocol::Request,
    ) -> Result<SeaLoadStreams, protocol::Response> {
        Err(invalid("event stream must be opened by the service host"))
    }

    async fn event_stream(
        &self,
        resume_after: Option<u64>,
        hint: protocol::LoadingHint,
    ) -> Result<SeaLoadStreams, protocol::Response> {
        let hint = hint.decode().map_err(|error| invalid(&error.to_string()))?;
        let load = self
            .session
            .load_bodies(
                resume_after.map_or(LoadStart::LatestSnapshot, |position| {
                    LoadStart::ReplayAtLeastAllAfter(EventPosition::new(position))
                }),
                hint,
            )
            .await
            .map_err(error_response)?;
        let snapshot = stream::iter(
            load.snapshot
                .map(|snapshot| protocol::Response::LoadSnapshot(snapshot_to_wire(&snapshot))),
        );
        Ok(SeaLoadStreams {
            events: Box::pin(snapshot.chain(load.events.map(|item| match item {
                Ok(MonitoredStreamItem::Item(event)) => session_event_to_wire(&event),
                Ok(MonitoredStreamItem::Progress(progress)) => protocol::Response::StreamProgress {
                    previous: progress.previous.map(EventPosition::get),
                    latest_known: progress.latest_known.map(EventPosition::get),
                    status: stream_status_to_wire(progress.status),
                },
                Err(error) => error_response(error),
            }))),
            content: Box::pin(stream::unfold(
                (Some(load.content), false),
                |(items, delivered_root)| async move {
                    let mut items = items?;
                    let response = match items.next().await? {
                        Ok(item)
                            if delivered_root
                                && blob_tree_encoded_len(&item).is_none_or(|length| {
                                    length > protocol::LOAD_CONTENT_MAX_ITEM_BYTES
                                }) =>
                        {
                            protocol::Response::LoadContentComplete.into()
                        }
                        Ok(item) => {
                            blob_tree_to_wire(item, Some(protocol::LOAD_CONTENT_MAX_ITEM_BYTES))
                        }
                        Err(error) => error_response(error).into(),
                    };
                    let remaining = matches!(
                        response,
                        SeaContentResponse::Blob { .. }
                            | SeaContentResponse::Message(protocol::Response::BlobTree { .. })
                    )
                    .then_some(items);
                    Some((response, (remaining, true)))
                },
            )),
        })
    }

    /// Every author-request error ends append authority, including input conversion failures.
    async fn author_request(&self, request: protocol::Request) -> protocol::Response {
        let response = match request {
            // The connection validated authority before binding this dispatcher.
            protocol::Request::OpenAuthorStream { .. } => protocol::Response::Acknowledged,
            protocol::Request::Submit { .. }
            | protocol::Request::AnnounceMembership { .. }
            | protocol::Request::Close => match self.request_inner(request).await {
                Ok(response) | Err(response) => response,
            },
            _ => invalid("request is not valid on an open author stream"),
        };
        if matches!(response, protocol::Response::Error { .. }) {
            let _ = self.session.close().await;
        }
        response
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
            protocol::Request::Close => protocol::Response::Acknowledged,
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
    ) -> Result<SeaContentStream, protocol::Response> {
        if let protocol::Request::GetBlobTrees { roots, hint } = request {
            let hint = hint.decode().map_err(|error| invalid(&error.to_string()))?;
            let first = roots.first().copied().map(tree_from_wire);
            let items = self
                .session
                .open_blob_trees(roots.into_iter().map(tree_from_wire).collect(), hint);
            return Ok(Box::pin(stream::unfold(
                (items, first, false),
                |(mut items, first, done)| async move {
                    if done {
                        return None;
                    }
                    match items.next().await {
                        Some(Ok(item)) if first.is_none_or(|id| id == item.id()) => {
                            Some((blob_tree_to_wire(item, None), (items, None, false)))
                        }
                        Some(Ok(_)) => Some((
                            invalid("content traversal omitted its first root").into(),
                            (items, None, true),
                        )),
                        Some(Err(error)) => {
                            Some((error_response(error).into(), (items, None, true)))
                        }
                        None if first.is_some() => Some((
                            invalid("content traversal omitted its first root").into(),
                            (items, None, true),
                        )),
                        None => None,
                    }
                },
            )));
        }
        if let protocol::Request::Read { after, stop_after } = request {
            let stream = self.session.read(
                after.map(EventPosition::new),
                stop_after.map(EventPosition::new),
            );
            return Ok(Box::pin(stream.map(|item| {
                SeaContentResponse::from(match item {
                    Ok(MonitoredStreamItem::Item(event)) => session_event_to_wire(&event),
                    Ok(MonitoredStreamItem::Progress(progress)) => {
                        protocol::Response::StreamProgress {
                            previous: progress.previous.map(EventPosition::get),
                            latest_known: progress.latest_known.map(EventPosition::get),
                            status: stream_status_to_wire(progress.status),
                        }
                    }
                    Err(error) => error_response(error),
                })
            })));
        }
        self.request_inner(request).await.map(|response| {
            Box::pin(stream::once(async move { response.into() })) as SeaContentStream
        })
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
            protocol::Request::OpenSignalStream(_) | protocol::Request::SendSignal(_) => {
                Err(invalid("signals require a signal stream"))
            }
            protocol::Request::AnnounceMembership { metadata } => {
                let position = self
                    .session
                    .announce_membership(Bytes::from(metadata))
                    .await
                    .map_err(error_response)?;
                Ok(protocol::Response::EventCommitted {
                    position: position.get(),
                })
            }
            protocol::Request::Submit { reference, event } => {
                let receipt = self
                    .session
                    .submit(EventSubmission {
                        reference: reference.map(EventPosition::new),
                        event: event_from_wire(event),
                    })
                    .await
                    .map_err(error_response)?;
                Ok(protocol::Response::EventCommitted {
                    position: receipt.get(),
                })
            }
            protocol::Request::GetSnapshot { .. } | protocol::Request::LatestSnapshot => {
                let start = if let protocol::Request::GetSnapshot { id } = request {
                    LoadStart::ReplayAtLeastAllAfter(EventPosition::new(id))
                } else {
                    LoadStart::LatestSnapshot
                };
                let snapshot = self
                    .session
                    .get_snapshot(start)
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
            | protocol::Request::GetBlobTrees { .. }
            | protocol::Request::LoadCredit { .. }
            | protocol::Request::CancelLoadContent
            | protocol::Request::CancelLoadEvents
            | protocol::Request::Read { .. } => {
                Err(invalid("request is not valid for this logical stream"))
            }
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
        }
    }
}

fn blob_tree_encoded_len(item: &BlobTreeBodyItem) -> Option<usize> {
    let length = match item {
        BlobTreeBodyItem::Blob { body, .. } => usize::try_from(body.len()).ok(),
        BlobTreeBodyItem::Directory { directory, .. } => directory
            .entries()
            .iter()
            .try_fold(4usize, |length, (name, _)| {
                length.checked_add(37)?.checked_add(name.len())
            }),
    };
    protocol::encode_blob_tree_prefix(
        protocol::StreamRole::Content,
        tree_to_wire(item.id()),
        length? as u64,
        protocol::Limits {
            max_frame_bytes: usize::MAX,
        },
    )
    .ok()
    .map(|prefix| prefix.encoded_len())
}

fn blob_tree_to_wire(item: BlobTreeBodyItem, ceiling: Option<usize>) -> SeaContentResponse {
    let id = tree_to_wire(item.id());
    let encoded_length = blob_tree_encoded_len(&item);
    if encoded_length.is_none()
        || ceiling.is_some_and(|limit| encoded_length.unwrap_or(usize::MAX) > limit)
    {
        return invalid("load content item exceeds the bounded frame ceiling").into();
    }
    let payload = match item {
        BlobTreeBodyItem::Blob { id, body } => {
            return SeaContentResponse::Blob {
                id: *id.as_bytes(),
                body,
            };
        }
        BlobTreeBodyItem::Directory { directory, .. } => match directory.encode() {
            Ok(bytes) => bytes.to_vec(),
            Err(error) => return invalid(&error.to_string()).into(),
        },
    };
    protocol::Response::BlobTree { id, payload }.into()
}

fn session_event_to_wire(event: &sea_core::archive::SessionCommittedEvent) -> protocol::Response {
    protocol::Response::LoadEvent(Box::new(protocol::StreamEvent {
        kind: match event.kind {
            sea_core::archive::SessionEventKind::Application => {
                protocol::SessionEventKind::Application
            }
            sea_core::archive::SessionEventKind::Joined => protocol::SessionEventKind::Joined,
            sea_core::archive::SessionEventKind::Left => protocol::SessionEventKind::Left,
        },
        position: event.committed.position.get(),

        session: event.session_id.get(),

        reference: event.reference.map(EventPosition::get),
        minimum_reference: event.minimum_reference.map(EventPosition::get),
        event: event_to_wire(&event.committed.event),
    }))
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

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use futures_util::StreamExt as _;
    use sea_core::storage::SeaStorage as _;
    use sea_memory::MemoryStorage;
    use sea_sequencer::session::LocalSequencer;

    use super::{SeaContentResponse, SessionDispatcher};
    use sea_webtransport::protocol;

    use crate::SeaConnectionService;

    /// Recovers a fresh in-memory document for one dispatcher test.
    async fn sequencer() -> Arc<LocalSequencer<MemoryStorage>> {
        let (_, view) = MemoryStorage::new().create_view().await.unwrap();
        LocalSequencer::<MemoryStorage>::recover(view)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn file_dispatch_retains_unread_bodies_for_demand_and_selected_load() {
        for durable in [false, true] {
            let root = std::env::temp_dir().join(format!(
                "sea-body-dispatch-{}-{durable}",
                std::process::id()
            ));
            if durable {
                check_file_dispatch(&root, sea_file::DurableStorage::open(&root).unwrap()).await;
            } else {
                check_file_dispatch(&root, sea_file::FileStorage::open(&root).unwrap()).await;
            }
            std::fs::remove_dir_all(root).unwrap();
        }
    }

    /// Exercises the owned-body boundary with published files, not a pending overlay.
    #[allow(clippy::too_many_lines)]
    async fn check_file_dispatch<S: sea_core::storage::SeaStorage + 'static>(
        root: &std::path::Path,
        storage: S,
    ) {
        use sea_core::storage::StorageHandle as _;
        use sea_core::{SeaArchive as _, SeaAuthorSession as _, SeaSnapshotCoordinator as _};
        let (_, view) = storage.create_view().await.unwrap();
        let sequencer = LocalSequencer::<S>::recover(view).await.unwrap();
        let session =
            sea_core::factory::PassThroughSession::new(sequencer.open_session(None).await.unwrap());
        let mut payload = vec![7; 128 * 1024];
        let handle = session
            .put_blob(bytes::Bytes::from(payload.clone()))
            .await
            .unwrap();
        let id = super::tree_to_wire(handle.id());
        let position = session
            .submit(sea_core::EventSubmission {
                reference: None,
                event: sea_core::Event {
                    payload: bytes::Bytes::new(),
                    blob_tree: Some(handle.id()),
                },
            })
            .await
            .unwrap();
        let coordination = session
            .coordinate_snapshots(sea_core::SnapshotParticipation::ClientSelected)
            .await
            .unwrap();
        session
            .publish_snapshot(
                None,
                None,
                sea_core::storage::Snapshot {
                    root: handle,
                    at_event: session.resolve_position(position).await.unwrap().unwrap(),
                },
            )
            .await
            .unwrap();
        storage.flush().await.unwrap();
        let directory = std::fs::read_dir(root)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .find(|path| {
                path.extension()
                    .is_some_and(|extension| extension == "content")
            })
            .unwrap();
        let file = std::fs::read_dir(directory)
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        let mut stored = std::fs::read(&file).unwrap();
        stored[33] = 4;
        payload[0] = 4;
        std::fs::write(&file, stored).unwrap();
        let dispatcher = SessionDispatcher::new(Arc::new(session));
        let request = protocol::Request::GetBlobTrees {
            roots: vec![id],
            hint: protocol::LoadingHint::default(),
        };
        let mut demand = dispatcher.content_request(request.clone()).await.unwrap();
        let mut load = dispatcher
            .event_stream(None, protocol::LoadingHint::default())
            .await
            .unwrap();
        assert!(
            matches!(load.events.next().await, Some(protocol::Response::LoadSnapshot(snapshot)) if snapshot.root == id)
        );
        for response in [
            demand.next().await.unwrap(),
            load.content.next().await.unwrap(),
        ] {
            let SeaContentResponse::Blob { body, .. } = response else {
                panic!("expected body")
            };
            assert!(matches!(body, sea_core::BlobBody::Reader { .. }));
            assert_eq!(body.collect().await.unwrap(), payload);
        }
        assert!(demand.next().await.is_none());
        assert!(load.content.next().await.is_none());
        let mut delayed = dispatcher.content_request(request).await.unwrap();
        let SeaContentResponse::Blob { body, .. } = delayed.next().await.unwrap() else {
            panic!("expected body")
        };
        std::fs::OpenOptions::new()
            .write(true)
            .open(&file)
            .unwrap()
            .set_len(33)
            .unwrap();
        assert_eq!(
            body.collect().await.unwrap_err().kind(),
            std::io::ErrorKind::UnexpectedEof
        );
        let large_length = sea_core::MAX_BLOB_TREE_BYTES as u64 + 1;
        std::fs::OpenOptions::new()
            .write(true)
            .open(file)
            .unwrap()
            .set_len(33 + large_length)
            .unwrap();
        let mut large_demand = dispatcher
            .content_request(protocol::Request::GetBlobTrees {
                roots: vec![id],
                hint: protocol::LoadingHint::default(),
            })
            .await
            .unwrap();
        let Some(SeaContentResponse::Blob { body, .. }) = large_demand.next().await else {
            panic!("transport configuration, not dispatch defaults, owns the demand frame limit")
        };
        assert_eq!(body.len(), large_length);
        drop((body, large_demand));
        let mut oversized = dispatcher.session.open_blob_trees(
            vec![
                super::tree_from_wire(id),
                sea_core::BlobTreeId::Blob(sea_core::BlobId::for_bytes(b"absent")),
            ],
            sea_core::BlobTreeHint::default(),
        );
        let sea_core::BlobTreeBodyItem::Blob { body, .. } =
            oversized.next().await.unwrap().unwrap()
        else {
            panic!("expected blob")
        };
        assert_eq!(body.len(), large_length);
        assert!(oversized.next().await.is_none());
        drop((body, oversized));
        drop((delayed, demand, load, coordination, dispatcher));
        sequencer.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn malformed_append_closes_authority_before_queued_submission() {
        let sequencer = sequencer().await;
        let session = sequencer.open_session(None).await.unwrap();
        let observer = sequencer.open_session(None).await.unwrap();
        let dispatcher = SessionDispatcher::new(Arc::new(session));
        let observer = SessionDispatcher::new(Arc::new(observer));
        dispatcher
            .author_request(protocol::Request::AnnounceMembership {
                metadata: Vec::new(),
            })
            .await;
        for reference in [Some(u64::MAX), None] {
            assert!(matches!(
                dispatcher
                    .author_request(protocol::Request::Submit {
                        reference,
                        event: protocol::Event {
                            payload: Vec::new(),
                            blob_tree: None
                        },
                    })
                    .await,
                protocol::Response::Error { .. }
            ));
        }
        let mut events = observer
            .event_stream(None, protocol::LoadingHint::default())
            .await
            .unwrap();
        let mut kinds = Vec::new();
        while let Some(response) = events.next().await {
            match response {
                protocol::Response::LoadEvent(event) => kinds.push(event.kind),
                protocol::Response::StreamProgress {
                    status: protocol::StreamStatus::AwaitingNewItems,
                    ..
                } => break,
                _ => {}
            }
        }
        assert_eq!(
            kinds,
            vec![
                protocol::SessionEventKind::Joined,
                protocol::SessionEventKind::Left
            ]
        );
    }

    #[tokio::test]
    async fn closing_old_snapshot_stream_preserves_replacement() {
        let sequencer = sequencer().await;
        let session = sequencer.open_session(None).await.unwrap();
        let dispatcher = SessionDispatcher::new(Arc::new(session));
        let opening = protocol::Request::OpenSnapshotStream {
            authority: Vec::new(),
            participation: protocol::SnapshotParticipation::SeaSelected,
        };
        let old = dispatcher.snapshot_stream(opening.clone()).await.unwrap();
        let mut replacement = dispatcher.snapshot_stream(opening).await.unwrap();
        let Some(protocol::Response::SnapshotCoordination { fence, .. }) = replacement.next().await
        else {
            panic!("replacement must be nominated");
        };
        assert_eq!(
            dispatcher.snapshot_request(protocol::Request::Close).await,
            protocol::Response::Acknowledged
        );
        drop(old);
        let mut uploaded = dispatcher
            .content_request(protocol::Request::PutBlob {
                payload: b"state".to_vec(),
            })
            .await
            .unwrap();
        let Some(SeaContentResponse::Message(protocol::Response::BlobStored { id })) =
            uploaded.next().await
        else {
            panic!("blob missing");
        };
        let protocol::Response::EventCommitted { position } = dispatcher
            .author_request(protocol::Request::Submit {
                reference: None,
                event: protocol::Event {
                    payload: Vec::new(),
                    blob_tree: Some(protocol::TreeId::Blob(id)),
                },
            })
            .await
        else {
            panic!("event missing");
        };
        assert!(matches!(
            dispatcher
                .snapshot_request(protocol::Request::PublishSnapshot {
                    fence,
                    expected_parent: None,
                    at_event: position,
                    root: protocol::TreeId::Blob(id),
                })
                .await,
            protocol::Response::Snapshot(Some(_))
        ));
    }

    #[tokio::test]
    async fn dispatches_typed_role_operations() {
        let sequencer = sequencer().await;
        let session = sequencer.open_session(None).await.unwrap();
        let dispatcher = SessionDispatcher::new(Arc::new(session));

        let mut stored = dispatcher
            .content_request(protocol::Request::PutBlob {
                payload: b"content".to_vec(),
            })
            .await
            .expect("blob upload response");
        let SeaContentResponse::Message(protocol::Response::BlobStored { id }) = dispatcher
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
            Some(SeaContentResponse::Message(
                protocol::Response::BlobStored { .. }
            ))
        ));
        let mut fetched = dispatcher
            .content_request(protocol::Request::GetBlobTrees {
                roots: vec![protocol::TreeId::Blob(id)],
                hint: protocol::LoadingHint::default(),
            })
            .await
            .expect("blob fetch response");
        let protocol::Response::BlobTree {
            id: fetched_id,
            payload,
        } = fetched
            .next()
            .await
            .expect("blob fetch payload")
            .into_buffered()
            .await
        else {
            panic!("blob fetch should return bytes");
        };
        assert_eq!(fetched_id, protocol::TreeId::Blob(id));
        assert_eq!(payload, b"content-2");
        assert!(fetched.next().await.is_none());

        let protocol::Response::EventCommitted { position } = dispatcher
            .author_request(protocol::Request::Submit {
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

        let mut load = dispatcher
            .event_stream(None, protocol::LoadingHint::default())
            .await
            .expect("load stream");
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

    #[tokio::test]
    async fn joined_and_left_positions_are_valid_snapshot_dependencies() {
        let sequencer = sequencer().await;
        let actor = SessionDispatcher::new(Arc::new(sequencer.open_session(None).await.unwrap()));
        let observer =
            SessionDispatcher::new(Arc::new(sequencer.open_session(None).await.unwrap()));
        assert!(matches!(
            actor
                .author_request(protocol::Request::AnnounceMembership {
                    metadata: Vec::new(),
                })
                .await,
            protocol::Response::EventCommitted { .. }
        ));
        assert_eq!(
            actor.author_request(protocol::Request::Close).await,
            protocol::Response::Acknowledged
        );
        let mut events = observer
            .event_stream(None, protocol::LoadingHint::default())
            .await
            .unwrap();
        let mut positions = Vec::new();
        while let Some(response) = events.next().await {
            match response {
                protocol::Response::LoadEvent(event) => {
                    positions.push((event.kind, event.position));
                }
                protocol::Response::StreamProgress {
                    status: protocol::StreamStatus::AwaitingNewItems,
                    ..
                } => break,
                _ => {}
            }
        }
        assert_eq!(
            positions.iter().map(|(kind, _)| *kind).collect::<Vec<_>>(),
            vec![
                protocol::SessionEventKind::Joined,
                protocol::SessionEventKind::Left,
            ]
        );
        let mut coordination = observer
            .snapshot_stream(protocol::Request::OpenSnapshotStream {
                authority: Vec::new(),
                participation: protocol::SnapshotParticipation::SeaSelected,
            })
            .await
            .unwrap();
        let Some(protocol::Response::SnapshotCoordination { fence, .. }) =
            coordination.next().await
        else {
            panic!("observer must be nominated");
        };
        let mut uploaded = observer
            .content_request(protocol::Request::PutBlob {
                payload: b"membership snapshot".to_vec(),
            })
            .await
            .unwrap();
        let Some(SeaContentResponse::Message(protocol::Response::BlobStored { id })) =
            uploaded.next().await
        else {
            panic!("blob missing");
        };
        let root = protocol::TreeId::Blob(id);
        let mut expected_parent = None;
        for (_, position) in positions {
            assert_eq!(
                observer
                    .snapshot_request(protocol::Request::PublishSnapshot {
                        fence,
                        expected_parent,
                        at_event: position,
                        root,
                    })
                    .await,
                protocol::Response::Snapshot(Some(protocol::Snapshot {
                    at_event: position,
                    root,
                }))
            );
            expected_parent = Some(position);
        }
    }

    #[tokio::test]
    async fn snapshot_publication_rejects_unresolved_dependencies_before_publication() {
        let sequencer = sequencer().await;
        let session = sequencer.open_session(None).await.unwrap();
        let dispatcher = SessionDispatcher::new(Arc::new(session));
        let mut coordination = dispatcher
            .snapshot_stream(protocol::Request::OpenSnapshotStream {
                authority: Vec::new(),
                participation: protocol::SnapshotParticipation::SeaSelected,
            })
            .await
            .unwrap();
        let Some(protocol::Response::SnapshotCoordination { fence, .. }) =
            coordination.next().await
        else {
            panic!("publisher must be nominated");
        };
        let mut uploaded = dispatcher
            .content_request(protocol::Request::PutBlob {
                payload: b"snapshot".to_vec(),
            })
            .await
            .unwrap();
        let Some(SeaContentResponse::Message(protocol::Response::BlobStored { id })) =
            uploaded.next().await
        else {
            panic!("blob missing");
        };
        for (root, message) in [
            (
                protocol::TreeId::Blob([0; 32]),
                "snapshot tree is unavailable",
            ),
            (protocol::TreeId::Blob(id), "snapshot event is unavailable"),
        ] {
            assert_eq!(
                dispatcher
                    .snapshot_request(protocol::Request::PublishSnapshot {
                        fence,
                        expected_parent: None,
                        at_event: u64::MAX,
                        root,
                    })
                    .await,
                protocol::Response::Error {
                    kind: protocol::ErrorKind::Invalid,
                    message: message.to_owned(),
                }
            );
            assert_eq!(
                dispatcher
                    .snapshot_request(protocol::Request::LatestSnapshot)
                    .await,
                protocol::Response::Snapshot(None)
            );
        }
    }

    #[tokio::test]
    async fn directory_wire_input_rejects_duplicate_and_invalid_names() {
        let sequencer = sequencer().await;
        let session = sequencer.open_session(None).await.unwrap();
        let dispatcher = SessionDispatcher::new(Arc::new(session));
        for names in [vec!["leaf", "leaf"], vec!["bad/name"], vec![""]] {
            let entries = names
                .into_iter()
                .map(|name| protocol::DirectoryEntry {
                    name: name.to_owned(),
                    child: protocol::TreeId::Blob([0; 32]),
                })
                .collect();
            assert!(matches!(
                dispatcher
                    .content_request(protocol::Request::PutDirectory { entries })
                    .await,
                Err(protocol::Response::Error {
                    kind: protocol::ErrorKind::Invalid,
                    ..
                })
            ));
        }
    }

    #[tokio::test]
    async fn blob_tree_fetch_preserves_identity_and_can_truncate_descendants() {
        let sequencer = sequencer().await;
        let dispatcher =
            SessionDispatcher::new(Arc::new(sequencer.open_session(None).await.unwrap()));
        let Some(SeaContentResponse::Message(protocol::Response::BlobStored { id })) = dispatcher
            .content_request(protocol::Request::PutBlob {
                payload: b"leaf".to_vec(),
            })
            .await
            .unwrap()
            .next()
            .await
        else {
            panic!("missing leaf")
        };
        let leaf = protocol::TreeId::Blob(id);
        let Some(SeaContentResponse::Message(protocol::Response::DirectoryStored { id })) =
            dispatcher
                .content_request(protocol::Request::PutDirectory {
                    entries: vec![protocol::DirectoryEntry {
                        name: "child".to_owned(),
                        child: leaf,
                    }],
                })
                .await
                .unwrap()
                .next()
                .await
        else {
            panic!("missing directory")
        };
        let root = protocol::TreeId::Directory(id);
        for (max_extra_items, expected) in [(0, 1), (1, 2)] {
            let responses: Vec<_> = dispatcher
                .content_request(protocol::Request::GetBlobTrees {
                    roots: vec![root],
                    hint: protocol::LoadingHint::encode(sea_core::BlobTreeHint {
                        include_descendant_blobs: true,
                        max_extra_items,
                    })
                    .unwrap(),
                })
                .await
                .unwrap()
                .then(SeaContentResponse::into_buffered)
                .collect()
                .await;
            assert_eq!(responses.len(), expected);
            let protocol::Response::BlobTree { id, payload } = &responses[0] else {
                panic!("missing root")
            };
            assert_eq!(*id, root);
            let directory = sea_core::BlobDirectory::decode(payload).unwrap();
            assert_eq!(
                super::tree_to_wire(*directory.entries().get("child").unwrap()),
                leaf
            );
            if expected == 2 {
                assert_eq!(
                    responses[1],
                    protocol::Response::BlobTree {
                        id: leaf,
                        payload: b"leaf".to_vec()
                    }
                );
            }
        }
        let mut missing = dispatcher
            .content_request(protocol::Request::GetBlobTrees {
                roots: vec![protocol::TreeId::Blob([0; 32])],
                hint: protocol::LoadingHint::default(),
            })
            .await
            .unwrap();
        assert!(matches!(
            missing.next().await,
            Some(SeaContentResponse::Message(
                protocol::Response::Error { .. }
            ))
        ));
        assert!(missing.next().await.is_none());
    }

    #[tokio::test]
    async fn load_content_uses_the_initially_selected_snapshot() {
        let sequencer = sequencer().await;
        let dispatcher =
            SessionDispatcher::new(Arc::new(sequencer.open_session(None).await.unwrap()));
        let mut coordination = dispatcher
            .snapshot_stream(protocol::Request::OpenSnapshotStream {
                authority: Vec::new(),
                participation: protocol::SnapshotParticipation::SeaSelected,
            })
            .await
            .unwrap();
        let Some(protocol::Response::SnapshotCoordination { fence, .. }) =
            coordination.next().await
        else {
            panic!("missing publisher");
        };
        let mut previous = None;
        let mut selected = None;
        for bytes in [b"first".to_vec(), b"second".to_vec()] {
            let Some(SeaContentResponse::Message(protocol::Response::BlobStored { id })) =
                dispatcher
                    .content_request(protocol::Request::PutBlob {
                        payload: bytes.clone(),
                    })
                    .await
                    .unwrap()
                    .next()
                    .await
            else {
                panic!("missing root")
            };
            let root = protocol::TreeId::Blob(id);
            let protocol::Response::EventCommitted { position } = dispatcher
                .author_request(protocol::Request::Submit {
                    reference: None,
                    event: protocol::Event {
                        payload: Vec::new(),
                        blob_tree: Some(root),
                    },
                })
                .await
            else {
                panic!("missing event")
            };
            assert!(matches!(
                dispatcher
                    .snapshot_request(protocol::Request::PublishSnapshot {
                        fence,
                        expected_parent: previous,
                        at_event: position,
                        root,
                    })
                    .await,
                protocol::Response::Snapshot(Some(_))
            ));
            if selected.is_none() {
                selected = Some((
                    dispatcher
                        .event_stream(None, protocol::LoadingHint::default())
                        .await
                        .unwrap(),
                    root,
                    position,
                    bytes,
                ));
            }
            previous = Some(position);
        }
        let (mut load, root, position, bytes) = selected.unwrap();
        assert_eq!(
            load.events.next().await,
            Some(protocol::Response::LoadSnapshot(protocol::Snapshot {
                at_event: position,
                root
            }))
        );
        assert_eq!(
            load.content.next().await.unwrap().into_buffered().await,
            protocol::Response::BlobTree {
                id: root,
                payload: bytes
            }
        );
        assert!(load.content.next().await.is_none());
    }

    #[tokio::test]
    async fn oversized_prefetch_is_rejected_before_encoding_and_boundary_is_exact() {
        let limit = protocol::LOAD_CONTENT_MAX_ITEM_BYTES;
        let payload = vec![0; limit - 41];
        let item = sea_core::BlobTreeBodyItem::Blob {
            id: sea_core::BlobId::for_bytes(&payload),
            body: bytes::Bytes::from(payload).into(),
        };
        let response = super::blob_tree_to_wire(item, Some(limit))
            .into_buffered()
            .await;
        assert_eq!(
            protocol::encode_response_frame(
                protocol::StreamRole::Event,
                &response,
                protocol::Limits::default(),
            )
            .unwrap()
            .len(),
            limit
        );
        let payload = vec![0; limit - 40];
        let item = sea_core::BlobTreeBodyItem::Blob {
            id: sea_core::BlobId::for_bytes(&payload),
            body: bytes::Bytes::from(payload).into(),
        };
        assert!(matches!(
            super::blob_tree_to_wire(item, Some(limit)),
            SeaContentResponse::Message(protocol::Response::Error { .. })
        ));
    }

    #[tokio::test]
    #[allow(clippy::too_many_lines)]
    async fn snapshot_prefetch_truncates_large_descendants_but_demand_fetch_succeeds() {
        let sequencer = sequencer().await;
        let dispatcher =
            SessionDispatcher::new(Arc::new(sequencer.open_session(None).await.unwrap()));
        let Some(SeaContentResponse::Message(protocol::Response::BlobStored { id })) = dispatcher
            .content_request(protocol::Request::PutBlob {
                payload: vec![0; protocol::LOAD_CONTENT_MAX_ITEM_BYTES],
            })
            .await
            .unwrap()
            .next()
            .await
        else {
            panic!("missing leaf")
        };
        let leaf = protocol::TreeId::Blob(id);
        let Some(SeaContentResponse::Message(protocol::Response::DirectoryStored { id })) =
            dispatcher
                .content_request(protocol::Request::PutDirectory {
                    entries: vec![protocol::DirectoryEntry {
                        name: "large".to_owned(),
                        child: leaf,
                    }],
                })
                .await
                .unwrap()
                .next()
                .await
        else {
            panic!("missing directory")
        };
        let root = protocol::TreeId::Directory(id);
        let mut coordination = dispatcher
            .snapshot_stream(protocol::Request::OpenSnapshotStream {
                authority: Vec::new(),
                participation: protocol::SnapshotParticipation::SeaSelected,
            })
            .await
            .unwrap();
        let Some(protocol::Response::SnapshotCoordination { fence, .. }) =
            coordination.next().await
        else {
            panic!("missing publisher");
        };
        let protocol::Response::EventCommitted { position } = dispatcher
            .author_request(protocol::Request::Submit {
                reference: None,
                event: protocol::Event {
                    payload: Vec::new(),
                    blob_tree: Some(root),
                },
            })
            .await
        else {
            panic!("missing event")
        };
        assert!(matches!(
            dispatcher
                .snapshot_request(protocol::Request::PublishSnapshot {
                    fence,
                    expected_parent: None,
                    at_event: position,
                    root,
                })
                .await,
            protocol::Response::Snapshot(Some(_))
        ));
        let mut load = dispatcher
            .event_stream(
                None,
                protocol::LoadingHint::encode(sea_core::BlobTreeHint {
                    include_descendant_blobs: true,
                    max_extra_items: 1,
                })
                .unwrap(),
            )
            .await
            .unwrap();
        assert!(
            matches!(load.content.next().await, Some(SeaContentResponse::Message(protocol::Response::BlobTree { id, .. })) if id == root)
        );
        assert!(matches!(
            load.content.next().await,
            Some(SeaContentResponse::Message(
                protocol::Response::LoadContentComplete
            ))
        ));
        assert!(load.content.next().await.is_none());
        assert!(matches!(
            load.events.next().await,
            Some(protocol::Response::LoadSnapshot(_))
        ));
        let mut demand = dispatcher
            .content_request(protocol::Request::GetBlobTrees {
                roots: vec![leaf],
                hint: protocol::LoadingHint::default(),
            })
            .await
            .unwrap();
        assert!(
            matches!(demand.next().await, Some(SeaContentResponse::Blob { id, body }) if protocol::TreeId::Blob(id) == leaf && body.len() == protocol::LOAD_CONTENT_MAX_ITEM_BYTES as u64)
        );
        assert!(demand.next().await.is_none());
    }
}
