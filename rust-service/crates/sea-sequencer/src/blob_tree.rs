//! Lazy, request-scoped breadth-first content traversal.

use std::collections::{BTreeSet, VecDeque};

use futures_util::{StreamExt as _, stream};
use sea_core::{
    BlobTreeBodyItem, BlobTreeBodyStream, BlobTreeHint, BlobTreeId, BlobTreeItem, BlobTreeStream,
    MAX_BLOB_TREE_BYTES, MAX_BLOB_TREE_ITEMS, MAX_BLOB_TREE_ROOTS, MAX_BLOB_TREE_WORK,
    storage::{BlobStore, SeaStorage},
};

use super::{LocalSession, SessionError};

/// Traverses bounded work without retaining payloads from previously yielded items.
pub(super) fn open<S: SeaStorage + 'static>(
    session: LocalSession<S>,
    roots: Vec<BlobTreeId>,
    hint: BlobTreeHint,
) -> BlobTreeBodyStream<SessionError<S::Error>> {
    if roots.len() > MAX_BLOB_TREE_ROOTS {
        return Box::pin(stream::once(async {
            Err(SessionError::Rejected("too many blob-tree roots"))
        }));
    }
    let mut seen = BTreeSet::new();
    let pending = roots.into_iter().filter(|id| seen.insert(*id)).collect();
    let state = Traversal {
        session,
        pending,
        seen,
        hint,
        extras: 0,
        work: 0,
        items: 0,
        bytes: 0,
    };
    Box::pin(stream::try_unfold(state, |mut state| async move {
        if state.items >= MAX_BLOB_TREE_ITEMS || state.bytes >= MAX_BLOB_TREE_BYTES as u64 {
            return Ok(None);
        }
        let Some(id) = state.pending.pop_front() else {
            return Ok(None);
        };
        let view = state.session.view().await?;
        let (item, size) = match id {
            BlobTreeId::Blob(id) => {
                let body = view
                    .blobs()
                    .open_blob(id)
                    .await
                    .map_err(SessionError::Storage)?;
                let size = body.len();
                (BlobTreeBodyItem::Blob { id, body }, size)
            }
            BlobTreeId::Directory(id) => {
                let directory = view
                    .blobs()
                    .get_directory(id)
                    .await
                    .map_err(SessionError::Storage)?;
                let (encoded, actual) = directory
                    .encode_with_id()
                    .map_err(|_| SessionError::Corrupt("invalid directory encoding"))?;
                if actual != id {
                    return Err(SessionError::Corrupt("directory identity mismatch"));
                }
                (
                    BlobTreeBodyItem::Directory { id, directory },
                    encoded.len() as u64,
                )
            }
        };
        if state.items > 0 && size > (MAX_BLOB_TREE_BYTES as u64).saturating_sub(state.bytes) {
            return Ok(None);
        }
        state.bytes = state.bytes.saturating_add(size);
        state.items += 1;
        if let BlobTreeBodyItem::Directory { directory, .. } = &item {
            for child in directory.entries().values() {
                if state.work >= MAX_BLOB_TREE_WORK
                    || state.extras >= state.hint.max_extra_items
                    || state.extras as usize >= MAX_BLOB_TREE_ITEMS
                {
                    break;
                }
                state.work += 1;
                if (state.hint.include_descendant_blobs
                    || matches!(child, BlobTreeId::Directory(_)))
                    && state.seen.insert(*child)
                {
                    state.extras += 1;
                    state.pending.push_back(*child);
                }
            }
        }
        Ok(Some((item, state)))
    }))
}

/// Collects one leaf at a time for compatibility callers, without repeating traversal or selection.
pub(super) fn materialize<E: sea_core::ClassifiedError>(
    source: BlobTreeBodyStream<SessionError<E>>,
) -> BlobTreeStream<SessionError<E>> {
    Box::pin(stream::try_unfold(source, |mut source| async move {
        let Some(item) = source.next().await else {
            return Ok(None);
        };
        let item = match item? {
            BlobTreeBodyItem::Blob { id, body } => BlobTreeItem::Blob {
                id,
                bytes: body.collect().await.map_err(SessionError::BlobRead)?,
            },
            BlobTreeBodyItem::Directory { id, directory } => {
                BlobTreeItem::Directory { id, directory }
            }
        };
        Ok(Some((item, source)))
    }))
}

struct Traversal<S: SeaStorage> {
    session: LocalSession<S>,
    pending: VecDeque<BlobTreeId>,
    seen: BTreeSet<BlobTreeId>,
    hint: BlobTreeHint,
    extras: u32,
    work: usize,
    items: usize,
    bytes: u64,
}

#[cfg(test)]
mod tests {
    use bytes::Bytes;
    use futures_util::{StreamExt, TryStreamExt};
    use sea_core::{
        BlobDirectory, BlobId, ClassifiedError, ErrorKind, SeaArchive,
        storage::{LoadStart, StorageHandle},
    };
    use sea_memory::MemoryStorage;

    use super::*;
    use crate::session::LocalSequencer;

    #[tokio::test]
    async fn materialized_body_failure_terminates_before_later_roots() {
        let id = BlobId::for_bytes(b"first");
        let source = stream::iter([
            Ok(BlobTreeBodyItem::Blob {
                id,
                body: sea_core::BlobBody::Reader {
                    length: 1,
                    reader: Box::pin(std::io::Cursor::new(b"")),
                },
            }),
            Ok(BlobTreeBodyItem::Blob {
                id,
                body: Bytes::from_static(b"later").into(),
            }),
        ]);
        let mut items = materialize::<sea_memory::MemoryStorageError>(Box::pin(source));
        assert!(matches!(
            items.next().await,
            Some(Err(SessionError::BlobRead(_)))
        ));
        assert!(items.next().await.is_none());
    }

    async fn session() -> LocalSession<MemoryStorage> {
        let (_, view) = MemoryStorage::new().create_view().await.unwrap();
        LocalSequencer::recover(view)
            .await
            .unwrap()
            .open_session(None)
            .await
            .unwrap()
    }

    async fn directory(
        session: &LocalSession<MemoryStorage>,
        children: &[(&str, BlobTreeId)],
    ) -> BlobTreeId {
        session
            .put_directory(
                BlobDirectory::new(
                    children
                        .iter()
                        .map(|(name, id)| ((*name).into(), *id))
                        .collect(),
                )
                .unwrap(),
            )
            .await
            .unwrap()
            .id()
    }

    #[tokio::test]
    async fn roots_precede_breadth_first_descendants_and_deduplicate_the_entire_request() {
        let session = session().await;
        let leaf = session
            .put_blob(Bytes::from_static(b"leaf"))
            .await
            .unwrap()
            .id();
        let other = session
            .put_blob(Bytes::from_static(b"other"))
            .await
            .unwrap()
            .id();
        let deep = directory(&session, &[("leaf", leaf)]).await;
        let left = directory(&session, &[("deep", deep), ("leaf", leaf)]).await;
        let right = directory(&session, &[("deep", deep), ("other", other)]).await;
        let root = directory(&session, &[("left", left), ("right", right)]).await;
        let items: Vec<_> = session
            .get_blob_trees(
                vec![root, leaf, root],
                BlobTreeHint {
                    include_descendant_blobs: true,
                    max_extra_items: 10,
                },
            )
            .try_collect()
            .await
            .unwrap();
        assert_eq!(
            items.iter().map(BlobTreeItem::id).collect::<Vec<_>>(),
            vec![root, leaf, left, right, deep, other],
        );
        let items: Vec<_> = session
            .get_blob_trees(
                vec![root, leaf],
                BlobTreeHint {
                    include_descendant_blobs: false,
                    max_extra_items: 10,
                },
            )
            .try_collect()
            .await
            .unwrap();
        assert_eq!(
            items.iter().map(BlobTreeItem::id).collect::<Vec<_>>(),
            vec![root, leaf, left, right, deep],
        );
        let items: Vec<_> = session
            .get_blob_trees(
                vec![root, left],
                BlobTreeHint {
                    include_descendant_blobs: false,
                    max_extra_items: 1,
                },
            )
            .try_collect()
            .await
            .unwrap();
        assert_eq!(
            items.iter().map(BlobTreeItem::id).collect::<Vec<_>>(),
            vec![root, left, right]
        );
    }

    #[tokio::test]
    async fn default_hint_empty_roots_and_load_without_snapshot_do_not_prefetch() {
        let session = session().await;
        let leaf = session
            .put_blob(Bytes::from_static(b"leaf"))
            .await
            .unwrap()
            .id();
        let root = directory(&session, &[("leaf", leaf)]).await;
        let items: Vec<_> = session
            .get_blob_trees(vec![root], BlobTreeHint::default())
            .try_collect()
            .await
            .unwrap();
        assert_eq!(items.len(), 1);
        for start in [LoadStart::Beginning, LoadStart::LatestSnapshot] {
            let mut loaded = session
                .load(
                    start,
                    BlobTreeHint {
                        include_descendant_blobs: true,
                        max_extra_items: u32::MAX,
                    },
                )
                .await
                .unwrap();
            assert!(loaded.snapshot.is_none());
            assert!(loaded.content.next().await.is_none());
        }
        session.close().await.unwrap();
        assert!(
            session
                .get_blob_trees(vec![], BlobTreeHint::default())
                .next()
                .await
                .is_none()
        );
    }

    #[tokio::test]
    async fn oversized_first_root_makes_progress_and_later_roots_can_be_retried() {
        let session = session().await;
        let large = session
            .put_blob(Bytes::from(vec![7; MAX_BLOB_TREE_BYTES + 1]))
            .await
            .unwrap()
            .id();
        let small = session
            .put_blob(Bytes::from_static(b"small"))
            .await
            .unwrap()
            .id();
        let items: Vec<_> = session
            .get_blob_trees(vec![large, small], BlobTreeHint::default())
            .try_collect()
            .await
            .unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id(), large);
        let items: Vec<_> = session
            .get_blob_trees(vec![small], BlobTreeHint::default())
            .try_collect()
            .await
            .unwrap();
        assert_eq!(items[0].id(), small);
    }

    #[tokio::test]
    async fn accepts_the_full_root_budget_and_bounds_descendant_responses() {
        let session = session().await;
        let mut roots = Vec::new();
        let mut entries = Vec::new();
        for index in 0..MAX_BLOB_TREE_ROOTS {
            let id = session
                .put_blob(Bytes::from(index.to_le_bytes().to_vec()))
                .await
                .unwrap()
                .id();
            roots.push(id);
            entries.push((index.to_string(), id));
        }
        let items: Vec<_> = session
            .get_blob_trees(roots.clone(), BlobTreeHint::default())
            .try_collect()
            .await
            .unwrap();
        assert_eq!(
            items.iter().map(BlobTreeItem::id).collect::<Vec<_>>(),
            roots
        );

        let root = session
            .put_directory(BlobDirectory::new(entries.into_iter().collect()).unwrap())
            .await
            .unwrap()
            .id();
        let items: Vec<_> = session
            .get_blob_trees(
                vec![root],
                BlobTreeHint {
                    include_descendant_blobs: true,
                    max_extra_items: u32::MAX,
                },
            )
            .try_collect()
            .await
            .unwrap();
        assert_eq!(items.len(), MAX_BLOB_TREE_ITEMS);
        assert_eq!(items[0].id(), root);
        let received: BTreeSet<_> = items.iter().map(BlobTreeItem::id).collect();
        let missing: Vec<_> = roots
            .into_iter()
            .filter(|id| !received.contains(id))
            .collect();
        assert_eq!(missing.len(), 1);
        let recovered: Vec<_> = session
            .get_blob_trees(missing.clone(), BlobTreeHint::default())
            .try_collect()
            .await
            .unwrap();
        assert_eq!(
            recovered.iter().map(BlobTreeItem::id).collect::<Vec<_>>(),
            missing
        );
    }

    #[tokio::test]
    async fn missing_content_and_excess_roots_are_explicit_terminal_errors() {
        let session = session().await;
        let missing = BlobTreeId::Blob(BlobId::for_bytes(b"missing"));
        let mut content = session.get_blob_trees(vec![missing], BlobTreeHint::default());
        assert!(content.next().await.unwrap().is_err());
        assert!(content.next().await.is_none());
        let mut content = session.get_blob_trees(
            vec![missing; MAX_BLOB_TREE_ROOTS + 1],
            BlobTreeHint::default(),
        );
        assert_eq!(
            content.next().await.unwrap().unwrap_err().kind(),
            ErrorKind::Rejected
        );
        assert!(content.next().await.is_none());
    }
}
