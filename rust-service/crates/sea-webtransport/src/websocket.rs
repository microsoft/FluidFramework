//! Versioned WebSocket envelope; Sea frames remain transport-independent.

/// WebSocket subprotocol required on control and data connections.
pub const SUBPROTOCOL: &str = "sea-stream-v1";
/// Control endpoint; child sockets append the server-issued group token.
pub const PATH: &str = "/sea/websocket";
/// Maximum byte payload in one data message, independent of Sea frame size.
pub const CHUNK_BYTES: usize = 64 * 1024;
/// Data record tag followed by one nonempty byte chunk.
pub const DATA: u8 = 0;
/// Directional EOF record; WebSocket close is not a substitute.
pub const FIN: u8 = 1;

/// One validated transport record.
#[derive(Debug, PartialEq, Eq)]
pub enum Record<'bytes> {
    /// Borrowed byte payload.
    Data(&'bytes [u8]),
    /// Clean EOF of the peer's send direction.
    Finish,
}

/// Validates record tags and bounds before bytes reach the Sea decoder.
#[must_use]
pub fn decode(bytes: &[u8]) -> Option<Record<'_>> {
    match bytes {
        [FIN] => Some(Record::Finish),
        [DATA, payload @ ..] if !payload.is_empty() && payload.len() <= CHUNK_BYTES => {
            Some(Record::Data(payload))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_require_bounded_data_or_exact_finish() {
        assert_eq!(decode(&[FIN]), Some(Record::Finish));
        assert_eq!(decode(&[DATA, 42]), Some(Record::Data(&[42])));
        for invalid in [&[][..], &[DATA], &[FIN, 1], &[2]] {
            assert_eq!(decode(invalid), None);
        }
        assert!(decode(&vec![DATA; CHUNK_BYTES + 2]).is_none());
    }
}
