# Developing `sea-compression`

Run these commands from `rust-service/`:

```console
cargo test -p sea-compression --all-targets --all-features
cargo clippy -p sea-compression --all-targets --all-features -- -D warnings
RUSTDOCFLAGS="-D warnings" cargo doc -p sea-compression --all-features --no-deps
```

The test suite covers session conformance and round trips, malformed and truncated frames, trailing bytes, and representative compression ratios.