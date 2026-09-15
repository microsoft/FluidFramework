# Native Service Example

This example exposes the native service over a Unix-domain socket using length-prefixed FSP4 frames. It accepts one request per connection and prints `READY <socket>` after binding.

From `rust-service/`, run the bounded process tests:

```bash
cargo test -p fluid-native-service-example --test process -- --test-threads=1
cargo clippy -p fluid-native-service-example --all-targets --all-features -- -D warnings
```

The tests launch real service processes in temporary directories, exercise kill/restart recovery and stale-session handling, verify that a second process fences the first, send an explicit shutdown request, and clean up their sockets and data.

For manual protocol experiments, start the server with paths dedicated to the run:

```bash
cargo run -p fluid-native-service-example --bin fluid-native-service -- \
  --root /tmp/fluid-native-service-data \
  --socket /tmp/fluid-native-service.sock
```

The process runs until it receives a valid FSP4 `Shutdown` request or encounters an error. It is a local integration example, not a production daemon: it has no authentication, network listener, service manager integration, or concurrent request handling.