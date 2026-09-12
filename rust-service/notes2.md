# Description

This project has a few goals:

- Learn about the challenges of implementing a Fluid service. What are the hard problems one must solve?
- Gain experience working on larger, more greenfield projects with agents.
- Define a much simpler, cleaner, and more efficient service abstraction that is sufficient to power Fluid applications.
- Build simple and efficient implementations of this service:
	- backed by the file system;
	- entirely in memory.
- Implement wrappers that provide:
	- network transparency over WebTransport with backpressure;
	- compression, both per-message and across the stream;
	- end-to-end encryption.
- Support clients in native code through a Rust API and in the browser through WASM, except for the file system implementation.
- Connect this API to:
	- a test CRDT written in Rust (a counter);
	- a Fluid driver for use in any Fluid application, using a binary protocol;
	- SharedTree directly, with minimal runtime dependencies and a binary protocol.

## Stretch Goals

- Server garbage collection of summary blobs and/or ops.
- Harden the server against crashes through atomic writes, recovery from partial file appends, and deferred op sequencing for `fsync`.
- Benchmark against existing service implementations, measuring bundle size, throughput, lines of code, bandwidth, and file size.
