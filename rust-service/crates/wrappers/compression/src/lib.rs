#![doc = "Boundary for a transparent per-record compression wrapper."]

/// Phase 1 marker for a Phase 2 wrapper boundary.
#[derive(Debug)]
pub struct CompressionStream;
