//! Durable specialization of the replacement filesystem document engine.
//!
//! [`crate::next::DurableStorage`] uses [`sea_file::next::FileStorage`] in durable mode, which
//! synchronizes each journal record and document-namespace publication before acknowledgment. The
//! shared engine still owns framing, dependency validation, exclusive locking, handle provenance,
//! and read behavior; this module adds focused evidence for durable tail recovery and cross-factory
//! ownership.
//!
//! This path does not read or adapt the transitional file-storage format.

pub use sea_file::next::{FileBlobs, FileEvents, FileHandle, FileSnapshots, FileStorageError};

/// Exclusive file documents synchronizing records and namespace publication before acknowledgment.
pub type DurableStorage = sea_file::next::FileStorage<true>;

#[cfg(test)]
mod tests {
    use super::*;
    use bytes::Bytes;
    use futures_util::{FutureExt, StreamExt};
    use sea_core::{
        Durability, MonitoredStreamItem,
        next::{BlobStore, SeaStorage, Snapshot, StorageHandle},
    };
    use std::{
        fs,
        io::Write,
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
    };

    /// Unique local namespace for concurrently executing tests.
    static NEXT_ROOT: AtomicU64 = AtomicU64::new(0);
    /// Allocates a fresh path without any old-format fixtures.
    fn root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "sea-next-durable-{}-{}",
            std::process::id(),
            NEXT_ROOT.fetch_add(1, Ordering::Relaxed)
        ))
    }

    #[tokio::test]
    async fn replacement_durable_conformance() {
        let root = root();
        let storage = DurableStorage::open(&root).unwrap();
        assert_eq!(storage.durability(), Durability::Durable);
        sea_conformance::next::run_view_conformance(&storage).await;
        sea_conformance::next::run_snapshot_archive_conformance(&storage).await;
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn recovery_preserves_dependencies_discards_torn_tail_and_rejects_corruption() {
        let root = root();
        let storage = DurableStorage::open(&root).unwrap();
        let (id, view) = storage.create_view().await.unwrap();
        let blob = view
            .blobs()
            .put_blob(Bytes::from_static(b"state"))
            .await
            .unwrap();
        let event = view
            .append(Bytes::from_static(b"event"), Some(&blob))
            .await
            .unwrap();
        view.publish_snapshot(&Snapshot {
            root: blob.clone(),
            at_event: event.clone(),
        })
        .await
        .unwrap();
        drop(view);
        let path = root.join("0000000000000001.sea");
        let committed = fs::read(&path).unwrap();
        fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(b"partial next frame")
            .unwrap();
        let reopened = storage.open_view(&id).await.unwrap().unwrap();
        assert_eq!(reopened.head().await.unwrap(), Some(event.id()));
        assert_eq!(
            reopened
                .get_snapshot(sea_core::next::LoadStart::LatestSnapshot)
                .await
                .unwrap()
                .unwrap()
                .root
                .id(),
            blob.id()
        );
        assert_eq!(fs::read(&path).unwrap(), committed);
        drop(reopened);
        let mut corrupt = committed;
        corrupt[56] ^= 1;
        fs::write(&path, corrupt).unwrap();
        assert!(matches!(
            storage.open_view(&id).await,
            Err(FileStorageError::Corrupt(_))
        ));
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn independent_factories_and_live_streams_share_exclusive_ownership() {
        let root = root();
        let storage = DurableStorage::open(&root).unwrap();
        let other = DurableStorage::open(&root).unwrap();
        let (id, view) = storage.create_view().await.unwrap();
        let mut live = view.read(None, None);
        assert!(matches!(
            live.next().await,
            Some(Ok(MonitoredStreamItem::Progress(_)))
        ));
        assert!(live.next().now_or_never().is_none());
        view.append(Bytes::new(), None).await.unwrap();
        assert!(matches!(
            live.next().await,
            Some(Ok(MonitoredStreamItem::Item(_)))
        ));
        drop(view);
        assert!(matches!(
            other.open_view(&id).await,
            Err(FileStorageError::Busy)
        ));
        drop(live);
        assert!(other.open_view(&id).await.unwrap().is_some());
        fs::remove_dir_all(root).unwrap();
    }
}
