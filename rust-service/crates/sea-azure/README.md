# Sea Azure

Optional Azure Blob Storage backend, using the same implementation against Azure and Azurite.
The default server does not include this crate.

Construct `AzureFactory::new(endpoint, account, key, container)`, call `initialize` to create the container if needed, and wrap the factory with `AzureStorage::new`.
Credentials use Azure Shared Key authentication; obtain the key from your deployment's secret configuration.
The client does not log credentials or accept them in endpoint URLs.
HTTPS is required except for a localhost emulator.
Microsoft Entra token authentication is not implemented.
The implementation uses a small signed REST client rather than an SDK retry pipeline so uncertain appends are never automatically repeated.

## Persistence and ownership

Each document has a checksummed block-blob manifest and a chain of append-blob journal segments.
Blobs, directories, events, snapshots, and checkpoints are typed records in that journal.
This keeps document-wide publication ordering under one writer instead of coordinating leases over independently writable component stores.
The shared [remote adapter](../sea-remote/README.md) implements component semantics and validates record checksums and dependency closure.

Segments roll over at 40,000 append blocks or 64 MiB, whichever comes first.
An append block can contain a group of up to 128 framed records within the service's 4 MiB request limit.
Grouping changes the number of service requests, not record locations or the retained format.
The manifest records sealed segment lengths and the active segment identity.
A rollover creates and leases a fresh segment, seals the old boundary in a lease-protected manifest update, and only then appends to the new segment.
Failed or cancelled creation or rollover can leave unreachable blobs; collection is not implemented.
The 4 MiB manifest limit bounds the number of segments; exhausting it rejects further publication without pruning history.
Use `with_segment_blocks` to lower the rollover threshold for tests.

A document opening holds 60-second leases on the manifest and active segment.
A heartbeat renews them every 15 seconds, renewing the manifest first.
Ownership failures are terminal.
Authoritative observations renew the manifest lease; the heartbeat renews both leases.
Each append is fenced by its active-segment lease ID and expected byte offset, without redundant lease-renewal requests before each write.
Rollover still renews both leases before publishing a new active segment.
A new opener acquires the manifest lease, breaks any previous active-segment lease, and acquires a fresh segment lease before recovering data.
This fences delayed requests from the old opening, even while its Rust values remain alive.
Components, streams, and handles retain ownership; orderly shutdown releases it.
If the process or runtime disappears, leases expire server-side.
Reads, writes, and release errors are surfaced to callers; no mutation is retried transparently.

Event replay combines known record extents into bounded range requests within each segment.
Ranges stop at segment boundaries or 4 MiB, and every returned frame length and record checksum is verified.
Only requested records are retained, so gaps between event records do not inflate the reader's retained page.
Buffered history can finish delivery before remote lease loss is discovered on the next page fetch; known invalidation and shutdown stop it immediately.

Use an Azure account with zone-redundant storage (ZRS) for synchronous availability-zone replication.
An Azurite instance provides only the emulator's local persistence, not replicated durability.
Asynchronous geo-replication and failover to a lagging secondary do not preserve acknowledged commits and are outside this backend's guarantee.
Restrict direct writes and deletes in the container: service leases do not protect against privileged administrative modification.

## Local development and validation

Run Azurite with persistent local data:

```bash
docker run --rm --name sea-azurite-dev \
  -p 127.0.0.1:10000:10000 -v sea-azurite-data:/data \
  mcr.microsoft.com/azure-storage/azurite:3.35.0 \
  azurite-blob --blobHost 0.0.0.0 --location /data
```

Set `SEA_AZURE_ENDPOINT=http://127.0.0.1:10000/devstoreaccount1`, `SEA_AZURE_ACCOUNT=devstoreaccount1`, and `SEA_AZURE_KEY` to Azurite's documented development key.
Set `SEA_AZURE_CONTAINER` to a dedicated test container such as `sea-tests`.
You can instead configure a custom emulator account with `AZURITE_ACCOUNTS`.
From `rust-service/`, run:

```bash
cargo test -p sea-azure -- --include-ignored
```

The ignored service tests fail if configuration is missing or the service is unreachable.
They run conformance with forced rollover, cross-factory ownership, checkpoint recovery, and stale-writer fencing.
The same tests can target a real Azure account by changing the endpoint and credentials.
Azurite does not validate real Azure availability-zone failure behavior or performance.
