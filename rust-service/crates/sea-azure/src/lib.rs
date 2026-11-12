#![doc = include_str!("../README.md")]

mod http;
#[cfg(test)]
mod tests;

use async_trait::async_trait;
use bytes::{BufMut, Bytes, BytesMut};
use http::{Headers, Http};
use reqwest::{Method, StatusCode};
use sea_core::{ErrorKind, storage::DocumentId};
use sea_remote::{Error, Factory, Journal, MAX_BATCH_BYTES, MAX_RECORD_BYTES, Result};
use std::{sync::Arc, time::Duration};
use tokio::{sync::Mutex, task::JoinHandle};
use uuid::Uuid;

/// Azure or Azurite document storage, with no alternate emulator implementation.
pub type AzureStorage = sea_remote::Storage<AzureFactory>;
/// Segment size bounds each recovery HTTP response independently of total history size.
const SEGMENT_BYTES: u64 = 64 * 1024 * 1024;
/// High location bits select a segment; low bits select its frame offset.
const LOCATION_STRIDE: u64 = 1 << 32;
/// Versioned manifest encoding.
const MAGIC: &[u8; 8] = b"SEAAZR01";
/// Maximum manifest response accepted during recovery.
const MAX_MANIFEST_BYTES: usize = 4 * 1024 * 1024;

/// Configured authenticated container; create the container explicitly with `initialize`.
pub struct AzureFactory {
    /// Shared HTTP pool and credentials, never formatted through Debug.
    http: Arc<Http>,
    /// Rollover count below Azure's 50,000-block ceiling.
    segment_blocks: u32,
}

impl AzureFactory {
    /// Configures Shared Key authentication for Azure or a localhost Azurite endpoint.
    ///
    /// # Errors
    /// Rejects malformed credentials, container names, and insecure nonlocal endpoints.
    pub fn new(
        endpoint: &str,
        account: impl Into<String>,
        key: &str,
        container: impl Into<String>,
    ) -> Result<Self> {
        Ok(Self {
            http: Arc::new(Http::new(endpoint, account.into(), key, container.into())?),
            segment_blocks: 40_000,
        })
    }

    /// Lowers the segment block limit, for deterministic rollover testing or smaller segments.
    ///
    /// # Errors
    /// Rejects zero or values greater than 40,000.
    pub fn with_segment_blocks(mut self, blocks: u32) -> Result<Self> {
        if !(1..=40_000).contains(&blocks) {
            return Err(Error::rejected(
                "Azure segment blocks must be between 1 and 40000",
            ));
        }
        self.segment_blocks = blocks;
        Ok(self)
    }

    /// Creates the configured container, accepting only the specific already-exists response.
    ///
    /// # Errors
    /// Returns authentication, service, or network errors.
    pub async fn initialize(&self) -> Result<()> {
        let response = self
            .http
            .request(
                Method::PUT,
                "",
                &[("restype", "container")],
                Headers::new(),
                Bytes::new(),
            )
            .await?;
        if response.status() == StatusCode::CONFLICT
            && response
                .headers()
                .get("x-ms-error-code")
                .is_some_and(|code| code == "ContainerAlreadyExists")
        {
            return Ok(());
        }
        Http::expect(response, StatusCode::CREATED)?;
        Ok(())
    }

    /// Opens under a root lease, then fences the active segment before inspecting its bytes.
    async fn acquire(&self, document: String) -> Result<Option<AzureJournal>> {
        let root = format!("{document}/manifest");
        let response = self
            .http
            .request(Method::HEAD, &root, &[], Headers::new(), Bytes::new())
            .await?;
        if response.status() == StatusCode::NOT_FOUND
            && response
                .headers()
                .get("x-ms-error-code")
                .is_some_and(|code| code == "BlobNotFound")
        {
            return Ok(None);
        }
        Http::expect(response, StatusCode::OK)?;
        let root_lease = Uuid::new_v4().to_string();
        self.http.lease(&root, "acquire", &root_lease).await?;
        let ownership = Arc::new(Mutex::new(Ownership {
            http: self.http.clone(),
            root,
            root_lease,
            active: None,
            failure: None,
            closed: false,
        }));
        let mut journal = AzureJournal {
            http: self.http.clone(),
            document,
            segments: Vec::new(),
            length: 0,
            blocks: 0,
            segment_blocks: self.segment_blocks,
            ownership,
            heartbeat: None,
        };
        journal.start_heartbeat();
        let result = journal.recover_manifest().await;
        if let Err(error) = result {
            journal.close().await?;
            return Err(error);
        }
        Ok(Some(journal))
    }
}

/// Published segment identity and sealed byte boundary; the active segment has no sealed boundary.
struct Segment {
    /// Random name avoids reusing an abandoned rollover object's namespace.
    id: Uuid,
    /// Zero for the active segment, otherwise its immutable complete length.
    sealed: u64,
}

/// Root and active-segment leases renewed together under one local ordering lock.
struct Ownership {
    /// HTTP client retained by heartbeat and foreground operations.
    http: Arc<Http>,
    /// Manifest blob path.
    root: String,
    /// Fresh root lease, never reused after takeover.
    root_lease: String,
    /// Current segment and its fresh lease, if initialized.
    active: Option<(String, String)>,
    /// Terminal ownership failure reported to all subsequent operations.
    failure: Option<Error>,
    /// Makes release idempotent and stops foreground mutations.
    closed: bool,
}

impl Ownership {
    /// Rejects terminal ownership without making a remote observation.
    fn check_local(&self) -> Result<()> {
        if let Some(error) = &self.failure {
            return Err(error.clone());
        }
        if self.closed {
            return Err(Error::new(
                ErrorKind::Unavailable,
                "Azure opening is closed",
            ));
        }
        Ok(())
    }

    /// Checks the document authority before reporting an authoritative head or fetching a read page.
    async fn renew_root(&mut self) -> Result<()> {
        self.check_local()?;
        let result = self.http.lease(&self.root, "renew", &self.root_lease).await;
        if let Err(error) = &result {
            self.failure = Some(error.clone());
        }
        result
    }

    /// Renews root first; never extends a segment after losing root authority.
    async fn renew(&mut self) -> Result<()> {
        self.renew_root().await?;
        let result: Result<()> = async {
            if let Some((name, id)) = &self.active {
                self.http.lease(name, "renew", id).await?;
            }
            Ok(())
        }
        .await;
        if let Err(error) = &result {
            self.failure = Some(error.clone());
        }
        result
    }
}

/// Fenced segmented append journal; root and active leases define one writer opening.
pub struct AzureJournal {
    /// Provider pool without transparent retry.
    http: Arc<Http>,
    /// Document UUID used as a path prefix.
    document: String,
    /// Published segment chain, including the active tail.
    segments: Vec<Segment>,
    /// Confirmed active tail length.
    length: u64,
    /// Confirmed active tail block count.
    blocks: u32,
    /// Count threshold selected by the factory.
    segment_blocks: u32,
    /// Shared heartbeat and foreground fencing authority.
    ownership: Arc<Mutex<Ownership>>,
    /// Aborted on release; does not retain the journal or adapter opening.
    heartbeat: Option<JoinHandle<()>>,
}

impl Drop for AzureJournal {
    fn drop(&mut self) {
        if let Some(heartbeat) = self.heartbeat.take() {
            heartbeat.abort();
        }
        // Without an active runtime, the server-enforced finite leases expire.
    }
}

impl AzureJournal {
    /// Keeps idle documents exclusively owned without retaining application owners.
    fn start_heartbeat(&mut self) {
        let ownership = self.ownership.clone();
        self.heartbeat = Some(tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(15)).await;
                if ownership.lock().await.renew().await.is_err() {
                    break;
                }
            }
        }));
    }

    /// Returns the opaque physical name of one segment.
    fn name(&self, index: usize) -> String {
        format!("{}/{}", self.document, self.segments[index].id)
    }

    /// Fences the last published segment, validating the manifest before any record recovery.
    async fn recover_manifest(&mut self) -> Result<()> {
        let mut ownership = self.ownership.lock().await;
        let response = self
            .http
            .request(
                Method::GET,
                &ownership.root,
                &[],
                Headers::new(),
                Bytes::new(),
            )
            .await?;
        let bytes = Http::body(Http::expect(response, StatusCode::OK)?, MAX_MANIFEST_BYTES).await?;
        self.segments = decode_manifest(&bytes)?;
        let active = self.name(self.segments.len() - 1);
        self.http.lease(&active, "break", "").await?;
        let id = Uuid::new_v4().to_string();
        self.http.lease(&active, "acquire", &id).await?;
        ownership.active = Some((active.clone(), id));
        let response = self
            .http
            .request(Method::HEAD, &active, &[], Headers::new(), Bytes::new())
            .await?;
        let response = Http::expect(response, StatusCode::OK)?;
        self.length = number_header(&response, "content-length")?;
        self.blocks = u32::try_from(number_header(&response, "x-ms-blob-committed-block-count")?)
            .map_err(|_| Error::corrupt("Azure block count"))?;
        if self.length > SEGMENT_BYTES {
            return Err(Error::corrupt("Azure active segment exceeds size bound"));
        }
        ownership.renew().await
    }

    /// Publishes a fresh leased tail before permitting any records to be appended to it.
    async fn rollover(&mut self) -> Result<()> {
        let mut ownership = self.ownership.lock().await;
        ownership.renew().await?;
        let id = Uuid::new_v4();
        let name = format!("{}/{id}", self.document);
        create_segment(&self.http, &name).await?;
        let lease = Uuid::new_v4().to_string();
        self.http.lease(&name, "acquire", &lease).await?;
        let old_length = self.length;
        self.segments.last_mut().expect("active segment").sealed = old_length;
        self.segments.push(Segment { id, sealed: 0 });
        let encoded = encode_manifest(&self.segments)?;
        let headers = Headers::from([
            ("x-ms-blob-type".into(), "BlockBlob".into()),
            ("x-ms-lease-id".into(), ownership.root_lease.clone()),
        ]);
        let response = self
            .http
            .request(Method::PUT, &ownership.root, &[], headers, encoded)
            .await?;
        Http::expect(response, StatusCode::CREATED)?;
        let previous = ownership.active.replace((name, lease));
        self.length = 0;
        self.blocks = 0;
        if let Some((name, lease)) = previous {
            self.http.lease(&name, "release", &lease).await?;
        }
        Ok(())
    }

    /// Fetches a bounded segment and verifies its sealed boundary when applicable.
    async fn segment(&self, index: usize) -> Result<Bytes> {
        let response = self
            .http
            .request(
                Method::GET,
                &self.name(index),
                &[],
                Headers::new(),
                Bytes::new(),
            )
            .await?;
        let bytes = Http::body(
            Http::expect(response, StatusCode::OK)?,
            usize::try_from(SEGMENT_BYTES).expect("segment bound"),
        )
        .await?;
        let expected = if index + 1 == self.segments.len() {
            self.length
        } else {
            self.segments[index].sealed
        };
        if bytes.len() as u64 != expected {
            return Err(Error::corrupt("Azure segment boundary mismatch"));
        }
        Ok(bytes)
    }
}

/// Parses a required integral response header without substituting defaults.
fn number_header(response: &reqwest::Response, name: &str) -> Result<u64> {
    response
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok())
        .ok_or_else(|| Error::corrupt(format!("Azure missing or invalid {name}")))
}

/// Creates an append blob only when the randomly allocated name is unused.
async fn create_segment(http: &Http, name: &str) -> Result<()> {
    let response = http
        .request(
            Method::PUT,
            name,
            &[],
            Headers::from([
                ("x-ms-blob-type".into(), "AppendBlob".into()),
                ("if-none-match".into(), "*".into()),
            ]),
            Bytes::new(),
        )
        .await?;
    Http::expect(response, StatusCode::CREATED)?;
    Ok(())
}

/// Encodes the complete segment chain with explicit sealed boundaries.
fn encode_manifest(segments: &[Segment]) -> Result<Bytes> {
    if segments.len() > (MAX_MANIFEST_BYTES - 44) / 24 {
        return Err(Error::rejected("Azure manifest capacity exhausted"));
    }
    let mut bytes = BytesMut::new();
    bytes.extend_from_slice(MAGIC);
    bytes.put_u32(
        u32::try_from(segments.len()).map_err(|_| Error::rejected("too many Azure segments"))?,
    );
    for segment in segments {
        bytes.extend_from_slice(segment.id.as_bytes());
        bytes.put_u64(segment.sealed);
    }
    let checksum = sea_core::BlobId::for_bytes(&bytes);
    bytes.extend_from_slice(checksum.as_bytes());
    Ok(bytes.freeze())
}

/// Rejects malformed chains, duplicate segment names, and unsealed historical segments.
fn decode_manifest(bytes: &[u8]) -> Result<Vec<Segment>> {
    if bytes.len() < 44 || &bytes[..8] != MAGIC {
        return Err(Error::corrupt("Azure manifest version"));
    }
    let (bytes, checksum) = bytes.split_at(bytes.len() - 32);
    if sea_core::BlobId::for_bytes(bytes).as_bytes().as_slice() != checksum {
        return Err(Error::corrupt("Azure manifest checksum"));
    }
    let count = u32::from_be_bytes(bytes[8..12].try_into().expect("four bytes")) as usize;
    if count == 0 || count > (MAX_MANIFEST_BYTES - 44) / 24 || bytes.len() != 12 + count * 24 {
        return Err(Error::corrupt("Azure manifest length"));
    }
    let mut ids = std::collections::HashSet::new();
    let mut segments = Vec::with_capacity(count);
    for (index, chunk) in bytes[12..].as_chunks::<24>().0.iter().enumerate() {
        let id = Uuid::from_slice(&chunk[..16]).map_err(|e| Error::corrupt(e.to_string()))?;
        let sealed = u64::from_be_bytes(chunk[16..].try_into().expect("eight bytes"));
        if !ids.insert(id) || sealed > SEGMENT_BYTES || (sealed == 0) != (index + 1 == count) {
            return Err(Error::corrupt("Azure manifest segment chain"));
        }
        segments.push(Segment { id, sealed });
    }
    Ok(segments)
}

#[async_trait]
impl Factory for AzureFactory {
    type Journal = AzureJournal;
    async fn create(&self) -> Result<(DocumentId, AzureJournal)> {
        let id = Uuid::new_v4();
        let segment = Uuid::new_v4();
        create_segment(&self.http, &format!("{id}/{segment}")).await?;
        let response = self
            .http
            .request(
                Method::PUT,
                &format!("{id}/manifest"),
                &[],
                Headers::from([
                    ("x-ms-blob-type".into(), "BlockBlob".into()),
                    ("if-none-match".into(), "*".into()),
                ]),
                encode_manifest(&[Segment {
                    id: segment,
                    sealed: 0,
                }])?,
            )
            .await?;
        Http::expect(response, StatusCode::CREATED)?;
        let journal = self
            .acquire(id.to_string())
            .await?
            .ok_or_else(|| Error::corrupt("created Azure document disappeared"))?;
        Ok((
            DocumentId::from_bytes(Bytes::copy_from_slice(id.as_bytes())),
            journal,
        ))
    }
    async fn open(&self, id: &DocumentId) -> Result<Option<AzureJournal>> {
        let id = Uuid::from_slice(id.as_bytes())
            .map_err(|_| Error::rejected("Azure document ID must be a UUID"))?;
        self.acquire(id.to_string()).await
    }
}

#[async_trait]
impl Journal for AzureJournal {
    async fn check(&mut self) -> Result<()> {
        self.ownership.lock().await.renew_root().await
    }
    async fn append(&mut self, record: Bytes) -> Result<u64> {
        self.append_batch(vec![record])
            .await?
            .into_iter()
            .next()
            .ok_or_else(|| Error::new(ErrorKind::Ambiguous, "Azure append returned no location"))
    }
    async fn append_batch(&mut self, records: Vec<Bytes>) -> Result<Vec<u64>> {
        let size = sea_remote::batch_size(&records)? as u64;
        if records.is_empty() {
            return Ok(Vec::new());
        }
        if self.blocks >= self.segment_blocks || self.length + size > SEGMENT_BYTES {
            self.rollover().await?;
        }
        let mut frame = BytesMut::with_capacity(usize::try_from(size).expect("bounded group"));
        let base = (self.segments.len() as u64 - 1) * LOCATION_STRIDE + self.length;
        let mut locations = Vec::with_capacity(records.len());
        for record in records {
            locations.push(base + frame.len() as u64);
            frame.put_u32(
                u32::try_from(record.len()).map_err(|_| Error::rejected("Azure record length"))?,
            );
            frame.extend_from_slice(&record);
        }
        let ownership = self.ownership.lock().await;
        ownership.check_local()?;
        let (name, lease) = ownership
            .active
            .as_ref()
            .ok_or_else(|| Error::corrupt("Azure active lease missing"))?;
        let response = self
            .http
            .request(
                Method::PUT,
                name,
                &[("comp", "appendblock")],
                Headers::from([
                    ("x-ms-lease-id".into(), lease.clone()),
                    (
                        "x-ms-blob-condition-appendpos".into(),
                        self.length.to_string(),
                    ),
                ]),
                frame.freeze(),
            )
            .await?;
        Http::expect(response, StatusCode::CREATED)?;
        self.length += size;
        self.blocks += 1;
        Ok(locations)
    }
    async fn read(&mut self, location: u64) -> Result<Bytes> {
        let index = usize::try_from(location / LOCATION_STRIDE)
            .map_err(|_| Error::corrupt("Azure segment index"))?;
        let offset = location % LOCATION_STRIDE;
        if index >= self.segments.len() {
            return Err(Error::corrupt("Azure unknown segment"));
        }
        let response = self
            .http
            .request(
                Method::GET,
                &self.name(index),
                &[],
                Headers::from([("range".into(), format!("bytes={offset}-{}", offset + 3))]),
                Bytes::new(),
            )
            .await?;
        let header = Http::body(Http::expect(response, StatusCode::PARTIAL_CONTENT)?, 4).await?;
        let size = u32::from_be_bytes(
            header
                .as_ref()
                .try_into()
                .map_err(|_| Error::corrupt("Azure truncated frame header"))?,
        ) as usize;
        if size == 0 || size > MAX_RECORD_BYTES {
            return Err(Error::corrupt("Azure frame length"));
        }
        let response = self
            .http
            .request(
                Method::GET,
                &self.name(index),
                &[],
                Headers::from([(
                    "range".into(),
                    format!("bytes={}-{}", offset + 4, offset + 3 + size as u64),
                )]),
                Bytes::new(),
            )
            .await?;
        let bytes = Http::body(Http::expect(response, StatusCode::PARTIAL_CONTENT)?, size).await?;
        if bytes.len() != size {
            return Err(Error::corrupt("Azure truncated record"));
        }
        Ok(bytes)
    }
    async fn read_batch(&mut self, records: &[(u64, usize)]) -> Result<Vec<Bytes>> {
        sea_remote::validate_read_batch(records)?;
        let mut output = Vec::with_capacity(records.len());
        let mut start = 0;
        while start < records.len() {
            let first = records[start].0;
            let index = usize::try_from(first / LOCATION_STRIDE)
                .map_err(|_| Error::corrupt("Azure page segment"))?;
            if index >= self.segments.len() {
                return Err(Error::corrupt("Azure unknown page segment"));
            }
            let mut end = start + 1;
            let mut boundary = first
                .checked_add(records[start].1 as u64 + 4)
                .ok_or_else(|| Error::corrupt("Azure page boundary overflow"))?;
            while let Some(&(location, length)) = records.get(end) {
                let next = location
                    .checked_add(length as u64 + 4)
                    .ok_or_else(|| Error::corrupt("Azure page boundary overflow"))?;
                if location / LOCATION_STRIDE != index as u64
                    || next - first > MAX_BATCH_BYTES as u64
                {
                    break;
                }
                if location < boundary {
                    return Err(Error::corrupt("overlapping Azure page records"));
                }
                boundary = next;
                end += 1;
            }
            let extent = if index + 1 == self.segments.len() {
                self.length
            } else {
                self.segments[index].sealed
            };
            if boundary - index as u64 * LOCATION_STRIDE > extent {
                return Err(Error::corrupt("Azure page exceeds segment boundary"));
            }
            let response = self
                .http
                .request(
                    Method::GET,
                    &self.name(index),
                    &[],
                    Headers::from([(
                        "range".into(),
                        format!(
                            "bytes={}-{}",
                            first % LOCATION_STRIDE,
                            boundary - index as u64 * LOCATION_STRIDE - 1
                        ),
                    )]),
                    Bytes::new(),
                )
                .await?;
            let size = usize::try_from(boundary - first).expect("bounded page");
            let bytes =
                Http::body(Http::expect(response, StatusCode::PARTIAL_CONTENT)?, size).await?;
            if bytes.len() != size {
                return Err(Error::corrupt("Azure truncated read page"));
            }
            for &(location, length) in &records[start..end] {
                let offset = usize::try_from(location - first).expect("bounded relative location");
                let encoded = u32::from_be_bytes(
                    bytes[offset..offset + 4]
                        .try_into()
                        .expect("checked page range"),
                ) as usize;
                if encoded != length {
                    return Err(Error::corrupt("Azure page frame length mismatch"));
                }
                // Do not retain unrelated gap bytes through small slices of a range response.
                output.push(Bytes::copy_from_slice(
                    &bytes[offset + 4..offset + 4 + length],
                ));
            }
            start = end;
        }
        Ok(output)
    }
    async fn scan(&mut self, after: Option<u64>) -> Result<Vec<(u64, Bytes)>> {
        let mut index = usize::try_from(after.map_or(0, |p| p / LOCATION_STRIDE))
            .map_err(|_| Error::corrupt("Azure scan index"))?;
        loop {
            if index >= self.segments.len() {
                return Ok(Vec::new());
            }
            let bytes = self.segment(index).await?;
            let mut offset = 0;
            let mut page = Vec::new();
            while offset < bytes.len() {
                if bytes.len() - offset < 4 {
                    return Err(Error::corrupt("Azure truncated frame"));
                }
                let size =
                    u32::from_be_bytes(bytes[offset..offset + 4].try_into().expect("four bytes"))
                        as usize;
                if size == 0 || size > MAX_RECORD_BYTES || size > bytes.len() - offset - 4 {
                    return Err(Error::corrupt("Azure frame size"));
                }
                let location = index as u64 * LOCATION_STRIDE + offset as u64;
                if after.is_none_or(|cursor| location > cursor) {
                    page.push((location, bytes.slice(offset + 4..offset + 4 + size)));
                }
                offset += 4 + size;
            }
            if !page.is_empty() {
                return Ok(page);
            }
            index += 1;
        }
    }
    async fn close(&mut self) -> Result<()> {
        if let Some(heartbeat) = self.heartbeat.take() {
            heartbeat.abort();
        }
        let mut ownership = self.ownership.lock().await;
        if ownership.closed {
            return Ok(());
        }
        ownership.closed = true;
        let mut failure = None;
        if let Some((name, lease)) = ownership.active.take()
            && let Err(error) = self.http.lease(&name, "release", &lease).await
        {
            failure = Some(error);
        }
        if let Err(error) = self
            .http
            .lease(&ownership.root, "release", &ownership.root_lease)
            .await
        {
            failure.get_or_insert(error);
        }
        failure.map_or(Ok(()), Err)
    }
}
