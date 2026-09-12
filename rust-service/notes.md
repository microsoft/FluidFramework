# Rust Service

Low COGS service and driver.

- Rust: Native code for faster startup and lower overhead. Browser (local servicer style) support via wasm.
- Modular monolith archtecture: Single binary.
- Custom Driver and protocol: binary format.
	1. Client side compressed data: server never decompresses.
	2. Optional end to end encryption
- Optional persistence (to browser session storage for local-service or files for native).
	1. Optimized async local storage, maybe use io_uring
	2. Arc for blobs in memory. Or just rely on os file system cache?
- Optional cleanup/pruning of old data.
- Content addressable blob naming, can name client side.
- Optional bloom filter based cache hint from client to service.
- File for ops, append only, use byte offsets for sequence numbers: server doesn't even have to segment messages: client just asks for file ranges by byte ranges, sent with sendfile.
- Summary is just a blob hard link, name could be offset in op stream. Two kinds of blobs:
	1. Folder: children by name
	2. File: binary data
- Need mechanism for storing blobs uploaded with lifetime. Assume any op from session that uploaded the blob might need it. Up to client to reup that on reconnect if referencing blob in an op.
- With a index and hard linked blob files. Sendfile each of them. Index includes offset in opstream where next op after it will start.
- Use better hash than sha1.
- Flush ops to file lazy in large blocks or once old enough.
- Maybe use cap std.

## GC Mode

- ops folder. Name files by byte offset in op stream, in hex. Create new ops files after they get too long or too old.
- Delete old summaries: check oldest summary for byte offset into op stream: delete unneeded op files. Truncate op file if needed (for compliance to purge old data, and/or free up space).
- Store all blobs by hash in cache folder. GC it by looping through and checking hard link count: if one, delete.
- Can we get away with storing only the latest summary, and for old/offline only keeping ops? (no old blobs, not old summaries)
- General blobs + ops + summaries service. Write fluid driver against that.
- Second driver/client: directly use shared tree. No datastores. No separate summary client. Oldest client is session summarizes. Include id compressor as index in shared tree in this mode?
- Maybe optional hack to optionally download latest summary before making a new one, and reply ops, assert state is equal to local before summarizing.

## Trait for event source snapshotted stream

- Event stream Indexed by bytes
- Supports multiple sessions/clients: needs design for how we compose multiple single client sessions.
- Supports multiple documents.
- Maybe smaller trait for a single document and/or single session?
- Support backpressure, offline/status reporting, rejecting ops for resubmit
- Separate writer and reader connections (no need to reconnect read when adding write). Server tracks writers in oldest to newest list. Only allow summaries from oldest.
- Track oldest reference sequence number (call it reference offset?): writers send their ref sequence number as keep alive pings. Closed when too old (server heuristically updates threshold: sends to readers, closes out of date writers).
- Implementations:
	- compression wrapper, try two designs:
		- stores compressor state in snapshots, can compress across ops.
		- compress each op independently
	- encryption wrapper
	- Network transparent wrapper (via Webtransport): end to end back pressure. Support native server, and native or web (via web-sys) client.
	- In memory
	- Files/folders
	- Maybe linux specific hardlinks and IoURing?
	- Azure services (Can run server or client side) for durable storage.
	- High availability cluster / failover (wrap multiple implementations (likely network transparent ones), use quorum, recover/replace failed cluster members? How to handle multiple clients?)
- Use sans-io pattern?
- Example/test native event sourced data structure (counter).
