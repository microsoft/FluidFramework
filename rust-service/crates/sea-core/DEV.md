# Sea Core Development

Run these focused crate checks from `rust-service/`:

```bash
cargo fmt --all -- --check
cargo clippy -p sea-core --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-core --all-features --no-deps
cargo test -p sea-core --all-targets --all-features
cargo test -p sea-core --doc --all-features
```

See [workspace development guidance](../../DEVELOPMENT.md) for documentation checks, repository policy validation, and the full integration gate.
These focused checks do not replace the applicable workspace checks.