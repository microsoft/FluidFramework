//! Content-addressed blobs and immutable directory trees.
//!
//! Events may reference a [`BlobTreeId`], and snapshots use one as the root of their materialized
//! state. Leaves are identified from their bytes, while directories provide a canonical mapping
//! from validated names to other blobs or directories.

use std::{collections::BTreeMap, error::Error, fmt};

use blake3::Hasher;
use bytes::{Buf as _, BufMut as _, Bytes, BytesMut};

const CONTENT_ID_BYTES: usize = 32;
const BLOB_DOMAIN: &[u8] = b"sea:blob:v2\0";
const DIRECTORY_DOMAIN: &[u8] = b"sea:directory:v2\0";

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

/// The domain-separated BLAKE3 identity of an immutable binary leaf.
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

/// The domain-separated BLAKE3 identity of an immutable directory.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct BlobDirectoryId([u8; CONTENT_ID_BYTES]);

impl BlobDirectoryId {
    /// Computes the directory identity of the supplied encoded bytes.
    ///
    /// Hashes bytes as provided, without validating that they encode a canonical directory.
    #[must_use]
    pub fn for_encoded_bytes(bytes: &[u8]) -> Self {
        Self(domain_hash(DIRECTORY_DOMAIN, bytes))
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
    /// Validated child names kept in lexical order for canonical encoding.
    entries: BTreeMap<String, BlobTreeId>,
}

impl BlobDirectory {
    /// Creates a directory and validates every entry name.
    ///
    /// # Errors
    ///
    /// Returns an error for empty names, `/`, NUL bytes, `.` or `..`.
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

    /// Returns the canonical encoding and its domain-separated identity from one encoding pass.
    ///
    /// # Errors
    ///
    /// Returns an error when the directory cannot be canonically encoded.
    pub fn encode_with_id(&self) -> Result<(Bytes, BlobDirectoryId), BlobTreeError> {
        let encoded = self.encode()?;
        let id = BlobDirectoryId::for_encoded_bytes(&encoded);
        Ok((encoded, id))
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
        let mut previous_name: Option<&str> = None;
        for _ in 0..entry_count {
            if encoded.remaining() < 4 {
                return Err(BlobTreeError::TruncatedDirectory);
            }
            let name_length = usize::try_from(encoded.get_u32())
                .map_err(|_| BlobTreeError::TruncatedDirectory)?;
            let entry_length = name_length
                .checked_add(1 + CONTENT_ID_BYTES)
                .ok_or(BlobTreeError::TruncatedDirectory)?;
            if encoded.remaining() < entry_length {
                return Err(BlobTreeError::TruncatedDirectory);
            }
            let name = std::str::from_utf8(&encoded[..name_length])
                .map_err(|_| BlobTreeError::InvalidEntryEncoding)?;
            encoded.advance(name_length);
            validate_entry_name(name)?;
            if previous_name.is_some_and(|previous| previous >= name) {
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
            previous_name = Some(name);
            entries.insert(name.to_owned(), child);
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
        self.encode_with_id().map(|(_, id)| id)
    }
}

/// Requires the fixed width shared by leaf and directory identities.
fn content_id_bytes(bytes: &[u8]) -> Result<[u8; CONTENT_ID_BYTES], BlobTreeError> {
    bytes
        .try_into()
        .map_err(|_| BlobTreeError::InvalidIdLength {
            actual: bytes.len(),
        })
}

/// Prefixes stored bytes with their domain so leaf and directory identities remain distinct.
fn domain_hash(domain: &[u8], bytes: &[u8]) -> [u8; CONTENT_ID_BYTES] {
    let mut hash = Hasher::new();
    hash.update(domain);
    hash.update(bytes);
    *hash.finalize().as_bytes()
}

/// Rejects empty names, traversal segments, and embedded `/` or NUL characters.
fn validate_entry_name(name: &str) -> Result<(), BlobTreeError> {
    if name.is_empty() || matches!(name, "." | "..") || name.contains(['/', '\0']) {
        return Err(BlobTreeError::InvalidEntryName(name.to_owned()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::{BlobDirectory, BlobDirectoryId, BlobId, BlobTreeError, BlobTreeId};

    #[test]
    fn content_identities_use_versioned_blake3_domains() {
        assert_eq!(
            BlobId::for_bytes(&[]).as_bytes(),
            &[
                0x6f, 0x84, 0x57, 0x6a, 0x0a, 0xd4, 0x37, 0x09, 0x09, 0x71, 0x86, 0xd3, 0x29, 0xd5,
                0xea, 0x68, 0x52, 0x53, 0x5a, 0xc8, 0x66, 0x8a, 0x08, 0xa6, 0x71, 0x4a, 0x35, 0x88,
                0xd0, 0x2b, 0x3b, 0x4d,
            ]
        );
        assert_eq!(
            BlobDirectory::default()
                .id()
                .expect("empty directory id")
                .as_bytes(),
            &[
                0xa4, 0x2c, 0x08, 0x0c, 0x3d, 0x0b, 0x9b, 0xdb, 0x79, 0xc0, 0x67, 0x92, 0x6c, 0xa8,
                0x01, 0x4f, 0x79, 0x30, 0x2a, 0x51, 0x7c, 0x3a, 0x7e, 0x2e, 0xb3, 0x31, 0x3d, 0x71,
                0x69, 0xc2, 0x99, 0x2b,
            ]
        );
    }

    #[test]
    fn content_identities_require_exactly_32_bytes() {
        assert_eq!(
            BlobId::from_bytes(&[0; 31]),
            Err(BlobTreeError::InvalidIdLength { actual: 31 })
        );
        assert_eq!(
            BlobDirectoryId::from_bytes(&[0; 33]),
            Err(BlobTreeError::InvalidIdLength { actual: 33 })
        );
    }

    #[test]
    fn directory_identity_hashes_encoded_bytes_without_validation() {
        let encoded = [0, 0, 0, 0, 1];
        assert_eq!(
            BlobDirectory::decode(&encoded),
            Err(BlobTreeError::TrailingDirectoryBytes)
        );
        assert_eq!(
            BlobDirectoryId::for_encoded_bytes(&encoded),
            BlobDirectoryId(super::domain_hash(super::DIRECTORY_DOMAIN, &encoded))
        );
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
        for source in [&directory, &BlobDirectory::default()] {
            let (combined_encoding, combined_id) = source.encode_with_id().unwrap();
            assert_eq!(combined_encoding, source.encode().unwrap());
            assert_eq!(
                combined_id,
                BlobDirectoryId(super::domain_hash(
                    super::DIRECTORY_DOMAIN,
                    &combined_encoding
                ))
            );
            assert_eq!(
                combined_id,
                BlobDirectoryId::for_encoded_bytes(&combined_encoding)
            );
            assert_eq!(combined_id, source.id().unwrap());
        }
        let decoded = BlobDirectory::decode(&encoded).expect("canonical decoding");
        assert_eq!(decoded, directory);
    }

    #[test]
    fn directories_reject_paths_and_malformed_encodings() {
        for name in ["", ".", "..", "nested/name", "nul\0name"] {
            let invalid = BlobDirectory::new(BTreeMap::from([(
                name.to_owned(),
                BlobTreeId::Blob(BlobId::for_bytes(b"leaf")),
            )]));
            assert_eq!(
                invalid,
                Err(BlobTreeError::InvalidEntryName(name.to_owned()))
            );
        }
        assert_eq!(
            BlobDirectory::decode(&[0, 0, 0, 0, 1]),
            Err(BlobTreeError::TrailingDirectoryBytes)
        );
        assert_eq!(
            BlobDirectory::decode(&[0, 0, 0, 1, u8::MAX, u8::MAX, u8::MAX, u8::MAX]),
            Err(BlobTreeError::TruncatedDirectory)
        );
    }

    #[test]
    fn directory_encoding_has_stable_lengths_order_and_child_tags() {
        let directory = BlobDirectory::new(BTreeMap::from([
            (
                "b".to_owned(),
                BlobTreeId::Directory(BlobDirectoryId::from_bytes(&[2; 32]).unwrap()),
            ),
            (
                "a".to_owned(),
                BlobTreeId::Blob(BlobId::from_bytes(&[1; 32]).unwrap()),
            ),
        ]))
        .unwrap();
        let mut expected = vec![0, 0, 0, 2, 0, 0, 0, 1, b'a', 0];
        expected.extend_from_slice(&[1; 32]);
        expected.extend_from_slice(&[0, 0, 0, 1, b'b', 1]);
        expected.extend_from_slice(&[2; 32]);
        assert_eq!(directory.encode().unwrap().as_ref(), expected);
        assert_eq!(BlobDirectory::decode(&expected).unwrap(), directory);

        for length in 0..expected.len() {
            assert_eq!(
                BlobDirectory::decode(&expected[..length]),
                Err(BlobTreeError::TruncatedDirectory),
                "truncation at byte {length}"
            );
        }
        for (offset, value, error) in [
            (8, 0xff, BlobTreeError::InvalidEntryEncoding),
            (8, b'/', BlobTreeError::InvalidEntryName("/".to_owned())),
            (9, 2, BlobTreeError::InvalidChildTag(2)),
            (46, b'a', BlobTreeError::NonCanonicalEntryOrder),
            (46, b'0', BlobTreeError::NonCanonicalEntryOrder),
        ] {
            let mut malformed = expected.clone();
            malformed[offset] = value;
            assert_eq!(BlobDirectory::decode(&malformed), Err(error));
        }

        let mut malformed = expected.clone();
        malformed[47] = 2;
        for (name, error) in [
            (0xff, BlobTreeError::InvalidEntryEncoding),
            (b'/', BlobTreeError::InvalidEntryName("/".to_owned())),
            (b'a', BlobTreeError::NonCanonicalEntryOrder),
            (b'0', BlobTreeError::NonCanonicalEntryOrder),
        ] {
            malformed[46] = name;
            assert_eq!(
                BlobDirectory::decode(&malformed),
                Err(error),
                "name validation must precede the invalid child tag"
            );
        }
        malformed[46] = 0xff;
        assert_eq!(
            BlobDirectory::decode(&malformed[..47]),
            Err(BlobTreeError::TruncatedDirectory),
            "entry bounds must be checked before decoding the name"
        );
    }
}
