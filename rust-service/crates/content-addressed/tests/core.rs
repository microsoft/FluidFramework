use std::{
    fs,
    io::{Cursor, Read},
    path::{Path, PathBuf},
    str::FromStr,
    sync::{Arc, Barrier},
    thread,
};

use snapshotted_stream_content_addressed::{
    ContentDigest, ContentStore, FaultInjector, FaultPoint, StoreConfig, StoreError, SummaryEntry,
    SummaryManifest,
};

struct TestDirectory(PathBuf);

impl TestDirectory {
    fn new(label: &str) -> Self {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let sequence = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "content-addressed-{}-{label}-{sequence}",
            std::process::id()
        ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl AsRef<Path> for TestDirectory {
    fn as_ref(&self) -> &Path {
        &self.0
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn manifest(blob: ContentDigest) -> SummaryManifest {
    SummaryManifest {
        entries: vec![SummaryEntry {
            path: "root/data".to_owned(),
            blob,
        }],
    }
}

#[test]
fn digest_parsing_is_canonical_and_rejects_malformed_values() {
    let digest = ContentDigest::of(b"content");
    assert_eq!(ContentDigest::from_str(&digest.to_string()).unwrap(), digest);
    assert_eq!(
        ContentDigest::from_str(&digest.to_string().to_uppercase()).unwrap(),
        digest
    );
    assert!(matches!(
        ContentDigest::from_str("short"),
        Err(StoreError::InvalidDigest)
    ));
    assert!(matches!(
        ContentDigest::from_str(&"z".repeat(64)),
        Err(StoreError::InvalidDigest)
    ));
}

#[test]
fn bounded_streaming_round_trips_small_and_large_blobs_after_reopen() {
    let directory = TestDirectory::new("streaming");
    let config = StoreConfig {
        max_blob_bytes: 2 * 1024 * 1024,
        copy_buffer_bytes: 4096,
        ..StoreConfig::default()
    };
    let store = ContentStore::open(&directory, config).unwrap();
    let small = store.put_blob(Cursor::new(b"small")).unwrap();
    let mut generated = BoundedGeneratedReader::new(1024 * 1024 + 17, 4096);
    let large = store.put_blob(&mut generated).unwrap();
    assert_eq!(generated.bytes_read, 1024 * 1024 + 17);
    assert_eq!(fs::metadata(store.blob_path(small.digest)).unwrap().len(), 5);
    assert_eq!(
        fs::metadata(store.blob_path(large.digest)).unwrap().len(),
        large.size_bytes
    );
    drop(store);

    let reopened = ContentStore::open(&directory, config).unwrap();
    let mut small_bytes = Vec::new();
    reopened
        .open_blob(small.digest)
        .unwrap()
        .read_to_end(&mut small_bytes)
        .unwrap();
    assert_eq!(small_bytes, b"small");
    assert_eq!(reopened.verify_blob(large.digest).unwrap(), large.size_bytes);
}

struct BoundedGeneratedReader {
    remaining: usize,
    bytes_read: usize,
    maximum_request: usize,
}

impl BoundedGeneratedReader {
    fn new(length: usize, maximum_request: usize) -> Self {
        Self {
            remaining: length,
            bytes_read: 0,
            maximum_request,
        }
    }
}

impl Read for BoundedGeneratedReader {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        assert!(buffer.len() <= self.maximum_request);
        let read = buffer.len().min(self.remaining);
        buffer[..read].fill(0x5a);
        self.remaining -= read;
        self.bytes_read += read;
        Ok(read)
    }
}

#[test]
fn duplicate_and_concurrent_identical_uploads_are_idempotent() {
    let directory = TestDirectory::new("duplicates");
    let store = ContentStore::open(&directory, StoreConfig::default()).unwrap();
    let first = store.put_blob(Cursor::new(b"same bytes")).unwrap();
    let duplicate = store.put_blob(Cursor::new(b"same bytes")).unwrap();
    assert_eq!(duplicate.digest, first.digest);
    assert!(duplicate.deduplicated);

    let barrier = Arc::new(Barrier::new(8));
    let handles = (0..8)
        .map(|_| {
            let store = store.clone();
            let barrier = Arc::clone(&barrier);
            thread::spawn(move || {
                barrier.wait();
                store.put_blob(Cursor::new(vec![7_u8; 256 * 1024]))
            })
        })
        .collect::<Vec<_>>();
    let receipts = handles
        .into_iter()
        .map(|handle| handle.join().unwrap().unwrap())
        .collect::<Vec<_>>();
    assert!(receipts.iter().all(|receipt| receipt.digest == receipts[0].digest));
    assert_eq!(receipts.iter().filter(|receipt| !receipt.deduplicated).count(), 1);
    assert_eq!(store.verify_blob(receipts[0].digest).unwrap(), 256 * 1024);
}

#[test]
fn missing_corrupt_and_oversized_blobs_have_stable_errors() {
    let directory = TestDirectory::new("errors");
    let config = StoreConfig {
        max_blob_bytes: 8,
        copy_buffer_bytes: 3,
        ..StoreConfig::default()
    };
    let store = ContentStore::open(&directory, config).unwrap();
    let missing = ContentDigest::of(b"missing");
    assert!(matches!(
        store.open_blob(missing),
        Err(StoreError::MissingBlob(value)) if value == missing
    ));
    assert!(matches!(
        store.put_blob(Cursor::new(b"123456789")),
        Err(StoreError::BlobTooLarge { limit: 8 })
    ));

    let receipt = store.put_blob(Cursor::new(b"original")).unwrap();
    fs::write(store.blob_path(receipt.digest), b"changed!").unwrap();
    assert!(matches!(
        store.open_blob(receipt.digest),
        Err(StoreError::CorruptBlob { expected, .. }) if expected == receipt.digest
    ));
}

#[test]
fn summary_publication_verifies_references_and_round_trips_atomically() {
    let directory = TestDirectory::new("summary");
    let store = ContentStore::open(&directory, StoreConfig::default()).unwrap();
    let blob = store.put_blob(Cursor::new(b"payload")).unwrap();
    let summary = manifest(blob.digest);
    let receipt = store.publish_summary(&summary).unwrap();
    assert_eq!(store.load_summary(receipt.digest).unwrap(), summary);
    assert_eq!(
        fs::metadata(store.summary_path(receipt.digest)).unwrap().len(),
        receipt.persisted_bytes
    );
    let duplicate = store.publish_summary(&summary).unwrap();
    assert_eq!(duplicate.digest, receipt.digest);
    assert!(duplicate.deduplicated);

    let missing = ContentDigest::of(b"absent");
    assert!(matches!(
        store.publish_summary(&manifest(missing)),
        Err(StoreError::MissingBlob(value)) if value == missing
    ));
    assert_eq!(fs::read_dir(directory.as_ref().join("summaries")).unwrap().count(), 1);
}

#[test]
fn malformed_and_oversized_manifests_are_rejected() {
    let directory = TestDirectory::new("manifest-errors");
    let config = StoreConfig {
        max_manifest_bytes: 48,
        ..StoreConfig::default()
    };
    let store = ContentStore::open(&directory, config).unwrap();
    let blob = store.put_blob(Cursor::new(b"payload")).unwrap();
    let unsorted = SummaryManifest {
        entries: vec![
            SummaryEntry {
                path: "z".to_owned(),
                blob: blob.digest,
            },
            SummaryEntry {
                path: "a".to_owned(),
                blob: blob.digest,
            },
        ],
    };
    assert!(matches!(
        store.publish_summary(&unsorted),
        Err(StoreError::InvalidManifest(_))
    ));
    assert!(matches!(
        store.publish_summary(&SummaryManifest {
            entries: vec![SummaryEntry {
                path: "a-path-that-does-not-fit".to_owned(),
                blob: blob.digest,
            }],
        }),
        Err(StoreError::ManifestTooLarge { limit: 48 })
    ));
}

#[test]
fn blob_faults_never_expose_invalid_acknowledged_content() {
    let points = [
        FaultPoint::BlobAfterCreate,
        FaultPoint::BlobDuringWrite,
        FaultPoint::BlobAfterWrite,
        FaultPoint::BlobAfterFileSync,
        FaultPoint::BlobAfterPublish,
        FaultPoint::BlobAfterDirectorySync,
    ];
    let expected = ContentDigest::of(b"fault payload");
    for point in points {
        let directory = TestDirectory::new("blob-fault");
        let store = ContentStore::open_with_fault_injector(
            &directory,
            StoreConfig::default(),
            Arc::new(FaultInjector::new([point])),
        )
        .unwrap();
        let result = store.put_blob(Cursor::new(b"fault payload"));
        assert!(result.is_err(), "{point:?}");
        drop(store);

        let reopened = ContentStore::open(&directory, StoreConfig::default()).unwrap();
        let visible = reopened.open_blob(expected);
        if matches!(
            point,
            FaultPoint::BlobAfterPublish | FaultPoint::BlobAfterDirectorySync
        ) {
            assert!(visible.is_ok(), "{point:?}");
        } else {
            assert!(matches!(visible, Err(StoreError::MissingBlob(_))), "{point:?}");
        }
        assert_eq!(fs::read_dir(directory.as_ref().join("pending")).unwrap().count(), 0);
    }
}

#[test]
fn summary_faults_reopen_to_absent_or_fully_valid_manifest() {
    let points = [
        FaultPoint::SummaryAfterCreate,
        FaultPoint::SummaryDuringWrite,
        FaultPoint::SummaryAfterWrite,
        FaultPoint::SummaryAfterFileSync,
        FaultPoint::SummaryAfterPublish,
        FaultPoint::SummaryAfterDirectorySync,
    ];
    for point in points {
        let directory = TestDirectory::new("summary-fault");
        let baseline = ContentStore::open(&directory, StoreConfig::default()).unwrap();
        let blob = baseline.put_blob(Cursor::new(b"referenced")).unwrap();
        let summary = manifest(blob.digest);
        let expected = expected_summary_digest(&summary);
        drop(baseline);

        let store = ContentStore::open_with_fault_injector(
            &directory,
            StoreConfig::default(),
            Arc::new(FaultInjector::new([point])),
        )
        .unwrap();
        assert!(store.publish_summary(&summary).is_err(), "{point:?}");
        drop(store);

        let reopened = ContentStore::open(&directory, StoreConfig::default()).unwrap();
        let visible = reopened.load_summary(expected);
        if matches!(
            point,
            FaultPoint::SummaryAfterPublish | FaultPoint::SummaryAfterDirectorySync
        ) {
            assert_eq!(visible.unwrap(), summary, "{point:?}");
        } else {
            assert!(matches!(visible, Err(StoreError::MissingSummary(_))), "{point:?}");
        }
    }
}

fn expected_summary_digest(summary: &SummaryManifest) -> ContentDigest {
    let entry = &summary.entries[0];
    let mut encoded = Vec::new();
    encoded.extend_from_slice(b"CSUM001\0");
    encoded.extend_from_slice(&1_u32.to_be_bytes());
    encoded.extend_from_slice(&(entry.path.len() as u32).to_be_bytes());
    encoded.extend_from_slice(entry.path.as_bytes());
    encoded.extend_from_slice(entry.blob.as_bytes());
    ContentDigest::of(&encoded)
}

#[test]
fn corrupt_referenced_blob_invalidates_an_existing_summary() {
    let directory = TestDirectory::new("dangling");
    let store = ContentStore::open(&directory, StoreConfig::default()).unwrap();
    let blob = store.put_blob(Cursor::new(b"original")).unwrap();
    let summary = store.publish_summary(&manifest(blob.digest)).unwrap();
    fs::write(store.blob_path(blob.digest), b"corrupt!").unwrap();
    assert!(matches!(
        store.load_summary(summary.digest),
        Err(StoreError::CorruptBlob { expected, .. }) if expected == blob.digest
    ));
}