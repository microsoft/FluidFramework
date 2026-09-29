---
"__section": breaking
"__includeInReleaseNotes": false
---
Preserve primary Rust client failures when cleanup also fails

The experimental Rust Sea client's `ClientError` and `SeaClientError` now store a typed primary reason separately from supplementary diagnostic errors.
Mutation timeouts retain their ambiguous classification when cancellation fails.
Inspect `additional_errors()` for cleanup failures; nested diagnostics survive conversion to the typed client error and appear in display output.

Migrate enum construction and matching to the new reason enums:

```rust
// Before:
let error = SeaClientError::Closed;
assert!(matches!(error, SeaClientError::Closed));

// After:
let error = SeaClientError::new(SeaClientErrorReason::Closed);
assert!(matches!(error.reason(), SeaClientErrorReason::Closed));
assert!(error.additional_errors().is_empty());
```

`ClassifiedError::kind()` continues to classify only the primary failure.
No wire protocol or TypeScript API changes are required.
This changeset applies to Rust workspace crates, not an npm release-group package.
