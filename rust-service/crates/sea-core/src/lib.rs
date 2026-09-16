#![doc = "Core contracts for an opaque, client-snapshotted append stream."]

use std::{collections::BTreeMap, error::Error, fmt};

use bytes::{Buf as _, BufMut as _, Bytes, BytesMut};
use sha2::{Digest as _, Sha256};

pub mod archive;

const CONTENT_ID_BYTES: usize = 32;
const BLOB_DOMAIN: &[u8] = b"sea:blob:v1\0";
const DIRECTORY_DOMAIN: &[u8] = b"sea:directory:v1\0";

/// A stable event-order value within one archive.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct EventPosition(u64);

impl EventPosition {
    /// Creates a position from its implementation-assigned numeric value.
    #[must_use]
    pub const fn new(value: u64) -> Self {
        Self(value)
    }

    /// Returns the implementation-assigned numeric value.
    #[must_use]
    pub const fn get(self) -> u64 {
        self.0
    }

    /// Encodes the position in canonical big-endian order.
    #[must_use]
    pub const fn to_bytes(self) -> [u8; 8] {
        self.0.to_be_bytes()
    }

    /// Decodes one canonical position.
    #[must_use]
    pub const fn from_bytes(bytes: [u8; 8]) -> Self {
        Self(u64::from_be_bytes(bytes))
    }
}

/// A malformed content identity or blob-directory value.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BlobTreeError {
    /// A content identity did not contain exactly 32 bytes.
    InvalidIdLength {
        /// Number of bytes supplied by the caller.
        actual: usize,
    },
    /// A directory entry name was empty or was not one path segment.
    InvalidEntryName(String),
    /// A directory contains too many entries for the canonical encoding.
    TooManyEntries,
    /// A directory entry name is too large for the canonical encoding.
    EntryNameTooLong(String),
    /// A canonical directory encoding ended before all declared fields were available.
    TruncatedDirectory,
    /// A directory entry name was not valid UTF-8.
    InvalidEntryEncoding,
    /// Directory entries were not encoded in strictly increasing name order.
    NonCanonicalEntryOrder,
    /// A directory child used an unknown type tag.
    InvalidChildTag(u8),
    /// Bytes remained after the declared directory entries.
    TrailingDirectoryBytes,
}

impl fmt::Display for BlobTreeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidIdLength { actual } => {
                write!(
                    formatter,
                    "content identity has {actual} bytes; expected 32"
                )
            }
            Self::InvalidEntryName(name) => {
                write!(formatter, "invalid blob-directory name {name:?}")
            }
            Self::TooManyEntries => formatter.write_str("blob directory has too many entries"),
            Self::EntryNameTooLong(name) => {
                write!(formatter, "blob-directory name is too long: {name:?}")
            }
            Self::TruncatedDirectory => formatter.write_str("blob-directory encoding is truncated"),
            Self::InvalidEntryEncoding => {
                formatter.write_str("blob-directory name is not valid UTF-8")
            }
            Self::NonCanonicalEntryOrder => {
                formatter.write_str("blob-directory entries are not in canonical order")
            }
            Self::InvalidChildTag(tag) => write!(formatter, "invalid blob-tree child tag {tag}"),
            Self::TrailingDirectoryBytes => {
                formatter.write_str("blob-directory encoding has trailing bytes")
            }
        }
    }
}

impl Error for BlobTreeError {}

/// The domain-separated content identity of an immutable binary leaf.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct BlobId([u8; CONTENT_ID_BYTES]);

impl BlobId {
    /// Computes the identity of the supplied stored bytes.
    #[must_use]
    pub fn for_bytes(bytes: &[u8]) -> Self {
        Self(domain_hash(BLOB_DOMAIN, bytes))
    }

    /// Parses one raw identity.
    ///
    /// # Errors
    ///
    /// Returns an error when `bytes` is not exactly 32 bytes.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, BlobTreeError> {
        Ok(Self(content_id_bytes(bytes)?))
    }

    /// Returns the canonical identity bytes.
    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; CONTENT_ID_BYTES] {
        &self.0
    }
}

/// The domain-separated content identity of an immutable directory.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct BlobDirectoryId([u8; CONTENT_ID_BYTES]);

impl BlobDirectoryId {
    /// Parses one raw identity.
    ///
    /// # Errors
    ///
    /// Returns an error when `bytes` is not exactly 32 bytes.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, BlobTreeError> {
        Ok(Self(content_id_bytes(bytes)?))
    }

    /// Returns the canonical identity bytes.
    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; CONTENT_ID_BYTES] {
        &self.0
    }
}

/// The typed identity of a blob-tree leaf or directory.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum BlobTreeId {
    /// An immutable binary leaf.
    Blob(BlobId),
    /// An immutable directory containing named child identities.
    Directory(BlobDirectoryId),
}

/// An immutable directory mapping validated names to typed child identities.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct BlobDirectory {
    entries: BTreeMap<String, BlobTreeId>,
}

impl BlobDirectory {
    /// Creates a directory and validates every entry name.
    ///
    /// # Errors
    ///
    /// Returns an error for empty names, path separators, NUL bytes, `.` or `..`.
    pub fn new(entries: BTreeMap<String, BlobTreeId>) -> Result<Self, BlobTreeError> {
        for name in entries.keys() {
            validate_entry_name(name)?;
        }
        Ok(Self { entries })
    }

    /// Returns the entries in canonical lexical name order.
    #[must_use]
    pub const fn entries(&self) -> &BTreeMap<String, BlobTreeId> {
        &self.entries
    }

    /// Encodes this directory deterministically for persistence and hashing.
    ///
    /// # Errors
    ///
    /// Returns an error when an entry count or name does not fit the canonical encoding.
    pub fn encode(&self) -> Result<Bytes, BlobTreeError> {
        let entry_count =
            u32::try_from(self.entries.len()).map_err(|_| BlobTreeError::TooManyEntries)?;
        let mut encoded = BytesMut::new();
        encoded.put_u32(entry_count);
        for (name, child) in &self.entries {
            let name_length = u32::try_from(name.len())
                .map_err(|_| BlobTreeError::EntryNameTooLong(name.clone()))?;
            encoded.put_u32(name_length);
            encoded.extend_from_slice(name.as_bytes());
            match child {
                BlobTreeId::Blob(id) => {
                    encoded.put_u8(0);
                    encoded.extend_from_slice(id.as_bytes());
                }
                BlobTreeId::Directory(id) => {
                    encoded.put_u8(1);
                    encoded.extend_from_slice(id.as_bytes());
                }
            }
        }
        Ok(encoded.freeze())
    }

    /// Decodes and validates one canonical directory encoding.
    ///
    /// # Errors
    ///
    /// Returns an error for malformed, unsorted, duplicate, or trailing data.
    pub fn decode(mut encoded: &[u8]) -> Result<Self, BlobTreeError> {
        if encoded.remaining() < 4 {
            return Err(BlobTreeError::TruncatedDirectory);
        }
        let entry_count = encoded.get_u32();
        let mut entries = BTreeMap::new();
        let mut previous_name: Option<String> = None;
        for _ in 0..entry_count {
            if encoded.remaining() < 4 {
                return Err(BlobTreeError::TruncatedDirectory);
            }
            let name_length = usize::try_from(encoded.get_u32())
                .map_err(|_| BlobTreeError::TruncatedDirectory)?;
            if encoded.remaining() < name_length + 1 + CONTENT_ID_BYTES {
                return Err(BlobTreeError::TruncatedDirectory);
            }
            let name = std::str::from_utf8(&encoded[..name_length])
                .map_err(|_| BlobTreeError::InvalidEntryEncoding)?
                .to_owned();
            encoded.advance(name_length);
            validate_entry_name(&name)?;
            if previous_name
                .as_ref()
                .is_some_and(|previous| previous >= &name)
            {
                return Err(BlobTreeError::NonCanonicalEntryOrder);
            }
            let child_tag = encoded.get_u8();
            let child_bytes = &encoded[..CONTENT_ID_BYTES];
            let child = match child_tag {
                0 => BlobTreeId::Blob(BlobId::from_bytes(child_bytes)?),
                1 => BlobTreeId::Directory(BlobDirectoryId::from_bytes(child_bytes)?),
                tag => return Err(BlobTreeError::InvalidChildTag(tag)),
            };
            encoded.advance(CONTENT_ID_BYTES);
            previous_name = Some(name.clone());
            entries.insert(name, child);
        }
        if encoded.has_remaining() {
            return Err(BlobTreeError::TrailingDirectoryBytes);
        }
        Ok(Self { entries })
    }

    /// Computes this directory's domain-separated identity.
    ///
    /// # Errors
    ///
    /// Returns an error when the directory cannot be canonically encoded.
    pub fn id(&self) -> Result<BlobDirectoryId, BlobTreeError> {
        Ok(BlobDirectoryId(domain_hash(
            DIRECTORY_DOMAIN,
            &self.encode()?,
        )))
    }
}

/// One application event before or after commitment.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Event {
    /// Opaque application bytes.
    pub payload: Bytes,
    /// Optional immutable content tree referenced by this event.
    pub blob_tree: Option<BlobTreeId>,
}

fn content_id_bytes(bytes: &[u8]) -> Result<[u8; CONTENT_ID_BYTES], BlobTreeError> {
    bytes
        .try_into()
        .map_err(|_| BlobTreeError::InvalidIdLength {
            actual: bytes.len(),
        })
}

fn domain_hash(domain: &[u8], bytes: &[u8]) -> [u8; CONTENT_ID_BYTES] {
    let mut hash = Sha256::new();
    hash.update(domain);
    hash.update(bytes);
    hash.finalize().into()
}

fn validate_entry_name(name: &str) -> Result<(), BlobTreeError> {
    if name.is_empty() || matches!(name, "." | "..") || name.contains(['/', '\0']) {
        return Err(BlobTreeError::InvalidEntryName(name.to_owned()));
    }
    Ok(())
}

#[cfg(test)]
mod sea_value_tests {
    use std::collections::BTreeMap;

    use super::{BlobDirectory, BlobDirectoryId, BlobId, BlobTreeError, BlobTreeId, EventPosition};
    use crate::archive::SnapshotPosition;

    #[test]
    fn event_positions_use_canonical_ordered_bytes() {
        let positions = [
            EventPosition::new(0),
            EventPosition::new(1),
            EventPosition::new(u64::MAX),
        ];
        assert!(positions[0] < positions[1]);
        assert!(positions[1] < positions[2]);
        for position in positions {
            assert_eq!(EventPosition::from_bytes(position.to_bytes()), position);
        }
    }

    #[test]
    fn leaf_and_directory_identities_are_domain_separated() {
        let blob = BlobId::for_bytes(&[]);
        let directory = BlobDirectory::default().id().expect("empty directory id");
        assert_ne!(blob.as_bytes(), directory.as_bytes());
    }

    #[test]
    fn directories_round_trip_canonically() {
        let mut entries = BTreeMap::new();
        entries.insert(
            "zeta".to_owned(),
            BlobTreeId::Blob(BlobId::for_bytes(b"leaf")),
        );
        entries.insert(
            "alpha".to_owned(),
            BlobTreeId::Directory(BlobDirectoryId::from_bytes(&[7; 32]).expect("directory id")),
        );
        let directory = BlobDirectory::new(entries).expect("valid directory");
        let encoded = directory.encode().expect("canonical encoding");
        assert_eq!(
            BlobDirectory::decode(&encoded).expect("canonical decoding"),
            directory
        );
        assert_eq!(
            BlobDirectory::decode(&encoded)
                .expect("canonical decoding")
                .id()
                .expect("decoded id"),
            directory.id().expect("source id")
        );
    }

    #[test]
    fn directories_reject_paths_and_malformed_encodings() {
        let invalid = BlobDirectory::new(BTreeMap::from([(
            "nested/name".to_owned(),
            BlobTreeId::Blob(BlobId::for_bytes(b"leaf")),
        )]));
        assert!(matches!(invalid, Err(BlobTreeError::InvalidEntryName(_))));
        assert_eq!(
            BlobDirectory::decode(&[0, 0, 0, 0, 1]),
            Err(BlobTreeError::TrailingDirectoryBytes)
        );
    }

    #[test]
    fn initial_snapshot_precedes_every_event_position() {
        assert!(SnapshotPosition::Initial < SnapshotPosition::At(EventPosition::new(0)));
    }
}

/// The durability completed before a successful append was acknowledged.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Durability {
    /// Visible to readers in this process, with no persistence guarantee.
    Memory,
    /// Submitted to an operating-system-backed store without a crash guarantee.
    Buffered,
    /// Persisted according to the implementation's documented crash guarantee.
    Durable,
}

/// Stable classes used by clients without erasing implementation details.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ErrorKind {
    /// A position or token is malformed, foreign, or beyond the committed head.
    InvalidPosition,
    /// A formerly valid position is no longer retained.
    StalePosition,
    /// The requested update conflicts with current committed state.
    Conflict,
    /// The implementation definitively refused the operation.
    Rejected,
    /// The operation may have committed even though no acknowledgement was returned.
    Ambiguous,
    /// The implementation cannot currently serve the operation.
    Unavailable,
    /// Persisted data failed structural or integrity validation.
    Corrupt,
}

/// An implementation error with a stable client-facing classification.
pub trait ClassifiedError: Error + Send + Sync + 'static {
    /// Returns the implementation-independent failure category.
    fn kind(&self) -> ErrorKind;
}

/// An opaque identity assigned to a published snapshot.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct SnapshotId(Bytes);

impl SnapshotId {
    /// Wraps implementation-defined identity bytes.
    #[must_use]
    pub fn from_bytes(value: Bytes) -> Self {
        Self(value)
    }

    /// Returns the opaque identity bytes without interpreting them.
    #[must_use]
    pub fn as_bytes(&self) -> &Bytes {
        &self.0
    }
}
