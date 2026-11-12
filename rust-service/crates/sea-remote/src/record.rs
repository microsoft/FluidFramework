//! Versioned, checked records shared by remote journal providers.

use bytes::{BufMut, Bytes, BytesMut};
use sea_core::{BlobDirectory, BlobId, BlobTreeId, Event, EventPosition};

use crate::{Error, Result};

/// Largest encoded record accepted by either provider, including framing owned by this adapter.
pub const MAX_RECORD_BYTES: usize = 4 * 1024 * 1024 - 4;
/// Version marker prevents interpreting unrelated persisted formats as this journal.
const MAGIC: &[u8] = b"SEAREM01";

/// One atomic publication in document order.
pub(crate) enum Record {
    /// Immutable leaf content.
    Blob(Bytes),
    /// Canonical immutable directory content.
    Directory(BlobDirectory),
    /// Ordered application event.
    Event(Event),
    /// Snapshot root and its committed event.
    Snapshot(BlobTreeId, EventPosition),
    /// Independent opaque recovery state.
    Checkpoint(Bytes),
}

impl Record {
    /// Encodes a versioned record and hashes its complete body before remote admission.
    pub(crate) fn encode(&self) -> Result<Bytes> {
        let mut body = BytesMut::new();
        body.extend_from_slice(MAGIC);
        match self {
            Self::Blob(bytes) => {
                body.put_u8(0);
                body.extend_from_slice(bytes);
            }
            Self::Directory(directory) => {
                body.put_u8(1);
                body.extend_from_slice(
                    &directory
                        .encode()
                        .map_err(|e| Error::rejected(e.to_string()))?,
                );
            }
            Self::Event(event) => {
                body.put_u8(2);
                match event.blob_tree {
                    None => body.put_u8(0),
                    Some(id) => {
                        body.put_u8(1);
                        put_tree(&mut body, id);
                    }
                }
                body.extend_from_slice(&event.payload);
            }
            Self::Snapshot(root, position) => {
                body.put_u8(3);
                put_tree(&mut body, *root);
                body.put_u64(position.get());
            }
            Self::Checkpoint(bytes) => {
                body.put_u8(4);
                body.extend_from_slice(bytes);
            }
        }
        if body.len() + 32 > MAX_RECORD_BYTES {
            return Err(Error::rejected("encoded record exceeds 4 MiB"));
        }
        let checksum = BlobId::for_bytes(&body);
        body.extend_from_slice(checksum.as_bytes());
        Ok(body.freeze())
    }

    /// Verifies the whole frame before decoding its typed payload.
    pub(crate) fn decode(bytes: &Bytes) -> Result<Self> {
        if bytes.len() < MAGIC.len() + 33 || bytes.len() > MAX_RECORD_BYTES {
            return Err(Error::corrupt("record length"));
        }
        let body = bytes.slice(..bytes.len() - 32);
        if BlobId::for_bytes(&body).as_bytes().as_slice() != &bytes[body.len()..]
            || !body.starts_with(MAGIC)
        {
            return Err(Error::corrupt("record version or checksum"));
        }
        let mut payload = body.slice(MAGIC.len() + 1..);
        match body[MAGIC.len()] {
            0 => Ok(Self::Blob(payload)),
            1 => Ok(Self::Directory(
                BlobDirectory::decode(&payload).map_err(|e| Error::corrupt(e.to_string()))?,
            )),
            2 => {
                let tag = take(&mut payload, 1)?[0];
                let blob_tree = match tag {
                    0 => None,
                    1 => Some(get_tree(&mut payload)?),
                    _ => return Err(Error::corrupt("event tree tag")),
                };
                Ok(Self::Event(Event { payload, blob_tree }))
            }
            3 => {
                let root = get_tree(&mut payload)?;
                let number =
                    u64::from_be_bytes(take(&mut payload, 8)?[..].try_into().expect("eight bytes"));
                if number == 0 || !payload.is_empty() {
                    return Err(Error::corrupt("snapshot position or trailing bytes"));
                }
                Ok(Self::Snapshot(root, EventPosition::new(number)))
            }
            4 if !payload.is_empty() => Ok(Self::Checkpoint(payload)),
            _ => Err(Error::corrupt("record kind or empty checkpoint")),
        }
    }
}

/// Encodes the type tag and fixed-size content identity.
fn put_tree(bytes: &mut BytesMut, id: BlobTreeId) {
    match id {
        BlobTreeId::Blob(id) => {
            bytes.put_u8(0);
            bytes.extend_from_slice(id.as_bytes());
        }
        BlobTreeId::Directory(id) => {
            bytes.put_u8(1);
            bytes.extend_from_slice(id.as_bytes());
        }
    }
}

/// Takes a checked prefix without panicking on malformed remote data.
fn take(bytes: &mut Bytes, count: usize) -> Result<Bytes> {
    if bytes.len() < count {
        return Err(Error::corrupt("truncated record"));
    }
    Ok(bytes.split_to(count))
}

/// Parses one typed content identity.
fn get_tree(bytes: &mut Bytes) -> Result<BlobTreeId> {
    let tag = take(bytes, 1)?[0];
    let id = take(bytes, 32)?;
    match tag {
        0 => Ok(BlobTreeId::Blob(
            BlobId::from_bytes(&id).map_err(|e| Error::corrupt(e.to_string()))?,
        )),
        1 => Ok(BlobTreeId::Directory(
            sea_core::BlobDirectoryId::from_bytes(&id)
                .map_err(|e| Error::corrupt(e.to_string()))?,
        )),
        _ => Err(Error::corrupt("content identity tag")),
    }
}
