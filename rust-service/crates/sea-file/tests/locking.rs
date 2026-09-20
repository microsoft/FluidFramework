//! Cross-process lock checks run separately so fork cannot retain parallel unit tests' locks.

use bytes::Bytes;
use sea_core::storage::{DocumentId, SeaStorage};
use sea_file::storage::{FileStorage, FileStorageError};
use std::path::Path;

/// Checks that either persistence policy respects the stable document lock.
async fn assert_busy<const DURABLE: bool>(root: &Path) {
    let storage = FileStorage::<DURABLE>::open(root).unwrap();
    let id = DocumentId::from_bytes(Bytes::copy_from_slice(&1_u64.to_be_bytes()));
    assert!(matches!(
        storage.open_document(&id).await,
        Err(FileStorageError::Busy)
    ));
}

#[tokio::test]
async fn append_keeps_exclusive_lock_across_processes() {
    if let Some(root) = std::env::var_os("SEA_JOURNAL_LOCK_PROBE") {
        assert_busy::<false>(Path::new(&root)).await;
        assert_busy::<true>(Path::new(&root)).await;
        return;
    }
    let root = std::env::temp_dir().join(format!("sea-lock-{}", std::process::id()));
    let storage = FileStorage::<true>::open(&root).unwrap();
    let (id, view) = storage.create_view().await.unwrap();
    for payload in [b"first".as_slice(), b"second"] {
        view.append(Bytes::from_static(payload), None)
            .await
            .unwrap();
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "append_keeps_exclusive_lock_across_processes"])
            .env("SEA_JOURNAL_LOCK_PROBE", &root)
            .output()
            .unwrap();
        assert!(output.status.success(), "{output:?}");
    }
    drop(view);
    let reopened = storage.open_view(&id).await.unwrap().unwrap();
    assert_eq!(
        reopened.head().await.unwrap(),
        Some(sea_core::EventPosition::new(2))
    );
    drop(reopened);
    std::fs::remove_dir_all(root).unwrap();
}
