# Sea PostgreSQL

Optional PostgreSQL document storage for SEA.
The crate is not a dependency of the default server, file storage, or core APIs.
Use `PostgresStorage::new(PostgresFactory::new(config))` with a `tokio_postgres::Config`.
TLS uses the operating system trust store and validates the server certificate and hostname.
Set `sslmode=require` for remote deployments; the PostgreSQL default `prefer` permits plaintext fallback.

Call `PostgresFactory::initialize` once before creating documents to install the `sea_documents` and `sea_records` tables in the configured database.
Use a dedicated database and restrict direct writes to these tables.
Initialization is idempotent and can run concurrently.
Document IDs are database-assigned positive 64-bit integers, encoded in big-endian order.

Each active document owns a dedicated PostgreSQL connection with a session advisory lock.
All journal operations use that connection; there is no connection pool, reconnect, or transparent retry.
Connection loss invalidates the opening.
A competing connection cannot acquire the same document lock until PostgreSQL has settled the old connection's work.
Appends insert one checked record or a bounded group in an autocommit transaction with `synchronous_commit=on`.
The document row's record count advances in the same SQL statement as the insert.
All records and the count update roll back together if any insertion in the group fails.
Typed parameter queries avoid preparing a new statement in a separate round trip for each journal operation.
Paged replay fetches the requested record ordinals in one query and rejects missing records or length mismatches.
The held connection lock fences writes without a preceding probe.
Authoritative heads and new read pages still probe the connection; a local cached head does not establish connection health.
Recovery checks that record ordinals form the complete prefix described by that count.
Database roles must not override durability settings or mutate data outside this backend.

Durability depends on PostgreSQL's WAL and storage configuration.
For managed HA deployment, select synchronous replication and a failover policy that preserves acknowledged commits and fences the old primary.
An asynchronous replica or a split-brain cluster does not satisfy those guarantees.
The adapter's [recovery, ownership, cancellation, and size limits](../sea-remote/README.md) also apply.

## Local development

Start a local PostgreSQL container with a development-only password and a persistent volume.
Bind its port to localhost, not all host interfaces.
For example:

```bash
docker run --rm --name sea-postgres-dev \
  -e POSTGRES_PASSWORD=sea-local-only -e POSTGRES_DB=sea \
  -p 127.0.0.1:5432:5432 -v sea-postgres-data:/var/lib/postgresql/data \
  postgres:17
```

From `rust-service/`, run the explicitly opt-in service tests:

```bash
SEA_POSTGRES_URL='host=127.0.0.1 user=postgres password=sea-local-only dbname=sea' \
  cargo test -p sea-postgres -- --ignored
```

The tests fail if the configuration is missing or the service is unreachable.
Ordinary workspace tests do not require a running database.
