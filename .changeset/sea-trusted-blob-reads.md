---
"__section": other
---
File-backed Sea blob reads trust published contents

The experimental Rust service's file backends no longer recompute blob content hashes on ordinary reads.
Sea-file also skips the blob's stored atomic-value checksum, without changing the storage format.
Publication hashing, directory validation, journal and checkpoint checks, and authenticated decryption remain unchanged.
Same-length payload corruption or truncation can be returned successfully.
Consumers requiring content-address validation must check the stored representation before applying compression or encryption decoding.
Reads and transport sending remain materialized; this change does not introduce streaming APIs or alter the wire format.
