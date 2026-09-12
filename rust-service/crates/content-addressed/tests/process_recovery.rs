use std::{
    fs,
    io::{Cursor, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use snapshotted_stream_content_addressed::{
    ContentDigest, ContentStore, StoreConfig, SummaryEntry, SummaryManifest,
};

const CHILD_TEST: &str = "process_restart_child";

struct TestDirectory(PathBuf);

impl TestDirectory {
    fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("content-addressed-process-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
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

#[test]
#[ignore = "spawned only by the process recovery test"]
fn process_restart_child() {
    let Some(root) = std::env::var_os("CONTENT_STORE_CHILD_ROOT") else {
        return;
    };
    let store = ContentStore::open(&root, StoreConfig::default()).unwrap();
    let blob = store.put_blob(Cursor::new(b"child payload")).unwrap();
    store
        .publish_summary(&SummaryManifest {
            entries: vec![SummaryEntry {
                path: "child/data".to_owned(),
                blob: blob.digest,
            }],
        })
        .unwrap();
    fs::write(
        PathBuf::from(root).join("pending/orphan.pending"),
        b"partial",
    )
    .unwrap();
}

#[test]
fn child_process_publication_survives_restart_and_orphan_cleanup() {
    let directory = TestDirectory::new();
    let status = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", CHILD_TEST, "--ignored", "--nocapture"])
        .env("CONTENT_STORE_CHILD_ROOT", directory.as_ref())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .unwrap();
    assert!(status.success());

    let blob_digest = ContentDigest::of(b"child payload");
    let reopened = ContentStore::open(&directory, StoreConfig::default()).unwrap();
    let mut bytes = Vec::new();
    reopened
        .open_blob(blob_digest)
        .unwrap()
        .read_to_end(&mut bytes)
        .unwrap();
    assert_eq!(bytes, b"child payload");
    assert_eq!(
        fs::read_dir(directory.as_ref().join("pending"))
            .unwrap()
            .count(),
        0
    );

    let summaries = fs::read_dir(directory.as_ref().join("summaries"))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(summaries.len(), 1);
    let summary_digest = summaries[0]
        .file_name()
        .to_str()
        .unwrap()
        .parse::<ContentDigest>()
        .unwrap();
    let summary = reopened.load_summary(summary_digest).unwrap();
    assert_eq!(summary.entries[0].blob, blob_digest);
}
