# Sea Core Development

Run these commands from `rust-service/`:

```bash
cargo fmt --all -- --check
cargo clippy -p sea-core --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc -p sea-core --all-features --no-deps
cargo test -p sea-core --all-targets --all-features
```