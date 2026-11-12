#![doc = include_str!("../README.md")]

#[cfg(test)]
mod tests;

use async_trait::async_trait;
use bytes::Bytes;
use sea_core::{ErrorKind, storage::DocumentId};
use sea_remote::{Error, Factory, Journal, Result};
use tokio::task::JoinHandle;
use tokio_postgres::{Client, Config};

/// PostgreSQL-backed SEA factory; provider dependencies remain opt-in.
pub type PostgresStorage = sea_remote::Storage<PostgresFactory>;

/// Connection configuration for a dedicated SEA database.
pub struct PostgresFactory {
    /// Kept private so debug output cannot expose passwords.
    config: Config,
}

impl PostgresFactory {
    /// Selects connection parameters without connecting or changing the database.
    #[must_use]
    pub fn new(config: Config) -> Self {
        Self { config }
    }

    /// Installs the backend's version-one relational schema.
    ///
    /// # Errors
    /// Returns connection or schema errors; callers must provision a writable database.
    pub async fn initialize(&self) -> Result<()> {
        let mut connection = self.connect().await?;
        let result = connection
            .client()?
            .batch_execute(
                "BEGIN;
             SELECT pg_advisory_xact_lock(-718263904);
             CREATE TABLE IF NOT EXISTS sea_documents (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                records BIGINT NOT NULL DEFAULT 0 CHECK (records >= 0)
             );
             CREATE TABLE IF NOT EXISTS sea_records (
                document BIGINT NOT NULL REFERENCES sea_documents(id),
                ordinal BIGINT NOT NULL CHECK (ordinal > 0),
                payload BYTEA NOT NULL,
                PRIMARY KEY (document, ordinal)
             );
             COMMIT;",
            )
            .await
            .map_err(unavailable);
        connection.close().await?;
        result
    }

    /// Opens a non-reconnecting connection with durable transaction acknowledgments.
    async fn connect(&self) -> Result<PostgresJournal> {
        let tls = native_tls::TlsConnector::new()
            .map_err(|e| Error::new(ErrorKind::Unavailable, format!("PostgreSQL TLS: {e}")))?;
        let (client, connection) = self
            .config
            .connect(postgres_native_tls::MakeTlsConnector::new(tls))
            .await
            .map_err(unavailable)?;
        let driver = tokio::spawn(connection);
        let mut journal = PostgresJournal {
            client: Some(client),
            driver: Some(driver),
            document: 0,
            records: 0,
        };
        if let Err(error) = journal
            .client()?
            .batch_execute("SET synchronous_commit = on")
            .await
        {
            journal.close().await?;
            return Err(unavailable(error));
        }
        Ok(journal)
    }
}

/// A dedicated connection holds the document lock until all work is settled.
pub struct PostgresJournal {
    /// Never replaced after acquiring the session advisory lock.
    client: Option<Client>,
    /// Owns protocol I/O and reports connection failures during explicit cleanup.
    driver: Option<JoinHandle<std::result::Result<(), tokio_postgres::Error>>>,
    /// Database-assigned document identity.
    document: i64,
    /// Expected complete journal prefix discovered under the lock.
    records: i64,
}

impl PostgresJournal {
    /// Rejects access after explicit closure instead of reconnecting without ownership.
    fn client(&self) -> Result<&Client> {
        self.client
            .as_ref()
            .ok_or_else(|| Error::new(ErrorKind::Unavailable, "PostgreSQL opening is closed"))
    }
}

impl Drop for PostgresJournal {
    fn drop(&mut self) {
        // Closing the socket makes PostgreSQL settle the active transaction before releasing locks.
        self.client.take();
        if let Some(driver) = self.driver.take() {
            driver.abort();
        }
    }
}

/// Converts non-mutating SQL failures while retaining server diagnostic context.
#[expect(
    clippy::needless_pass_by_value,
    reason = "Used as an owned Result::map_err conversion."
)]
fn unavailable(error: tokio_postgres::Error) -> Error {
    let diagnostic = error.as_db_error().map_or_else(
        || error.to_string(),
        |database| format!("{}: {}", database.code().code(), database.message()),
    );
    Error::new(ErrorKind::Unavailable, format!("PostgreSQL: {diagnostic}"))
}

#[async_trait]
impl Factory for PostgresFactory {
    type Journal = PostgresJournal;
    async fn create(&self) -> Result<(DocumentId, PostgresJournal)> {
        let mut journal = self.connect().await?;
        // Lock before commit so another opener cannot observe an unlocked new document.
        let transaction = journal
            .client
            .as_mut()
            .expect("connected")
            .transaction()
            .await
            .map_err(unavailable)?;
        let id: i64 = transaction
            .query_one("INSERT INTO sea_documents DEFAULT VALUES RETURNING id", &[])
            .await
            .map_err(unavailable)?
            .get(0);
        transaction
            .execute("SELECT pg_advisory_lock($1)", &[&id])
            .await
            .map_err(unavailable)?;
        transaction
            .commit()
            .await
            .map_err(|e| Error::new(ErrorKind::Ambiguous, format!("PostgreSQL create: {e}")))?;
        journal.document = id;
        Ok((
            DocumentId::from_bytes(Bytes::copy_from_slice(&id.to_be_bytes())),
            journal,
        ))
    }
    async fn open(&self, id: &DocumentId) -> Result<Option<PostgresJournal>> {
        let raw: [u8; 8] = id
            .as_bytes()
            .as_ref()
            .try_into()
            .map_err(|_| Error::rejected("PostgreSQL document ID must contain eight bytes"))?;
        let id = i64::from_be_bytes(raw);
        if id <= 0 {
            return Err(Error::rejected("PostgreSQL document ID must be positive"));
        }
        let mut journal = self.connect().await?;
        let acquired: bool = journal
            .client()?
            .query_one("SELECT pg_try_advisory_lock($1)", &[&id])
            .await
            .map_err(unavailable)?
            .get(0);
        if !acquired {
            return Err(Error::new(
                ErrorKind::Conflict,
                "PostgreSQL document is already open",
            ));
        }
        let Some(row) = journal
            .client()?
            .query_opt("SELECT records FROM sea_documents WHERE id=$1", &[&id])
            .await
            .map_err(unavailable)?
        else {
            journal.close().await?;
            return Ok(None);
        };
        journal.document = id;
        journal.records = row.get(0);
        Ok(Some(journal))
    }
}

#[async_trait]
impl Journal for PostgresJournal {
    async fn check(&mut self) -> Result<()> {
        self.client()?
            .simple_query("SELECT 1")
            .await
            .map_err(unavailable)?;
        Ok(())
    }
    async fn append(&mut self, record: Bytes) -> Result<u64> {
        if self.records == i64::MAX {
            return Err(Error::rejected("PostgreSQL record ordinal exhausted"));
        }
        let row = self.client()?.query_one(
            "WITH next AS (
                UPDATE sea_documents SET records=records+1 WHERE id=$1 AND records=$2 RETURNING records
             ) INSERT INTO sea_records(document,ordinal,payload)
               SELECT $1,records,$3 FROM next RETURNING ordinal",
            &[&self.document, &self.records, &record.as_ref()]
        ).await.map_err(|e| Error::new(ErrorKind::Ambiguous, format!("PostgreSQL append: {e}")))?;
        self.records = row.get(0);
        u64::try_from(self.records).map_err(|_| Error::corrupt("PostgreSQL record ordinal"))
    }
    async fn read(&mut self, location: u64) -> Result<Bytes> {
        let ordinal =
            i64::try_from(location).map_err(|_| Error::corrupt("PostgreSQL record location"))?;
        let row = self
            .client()?
            .query_opt(
                "SELECT payload FROM sea_records WHERE document=$1 AND ordinal=$2",
                &[&self.document, &ordinal],
            )
            .await
            .map_err(unavailable)?
            .ok_or_else(|| Error::corrupt("missing PostgreSQL record"))?;
        Ok(Bytes::from(row.get::<_, Vec<u8>>(0)))
    }
    async fn scan(&mut self, after: Option<u64>) -> Result<Vec<(u64, Bytes)>> {
        let after = i64::try_from(after.unwrap_or(0))
            .map_err(|_| Error::corrupt("PostgreSQL scan cursor"))?;
        let rows = self.client()?.query(
            "SELECT ordinal,payload FROM sea_records WHERE document=$1 AND ordinal>$2 ORDER BY ordinal LIMIT 16",
            &[&self.document, &after]).await.map_err(unavailable)?;
        let mut page = Vec::with_capacity(rows.len());
        let mut expected = after;
        for row in rows {
            expected = expected
                .checked_add(1)
                .ok_or_else(|| Error::corrupt("PostgreSQL record count overflow"))?;
            let ordinal: i64 = row.get(0);
            if ordinal != expected || ordinal > self.records {
                return Err(Error::corrupt("PostgreSQL journal gap or count mismatch"));
            }
            page.push((
                u64::try_from(ordinal)
                    .map_err(|_| Error::corrupt("PostgreSQL negative ordinal"))?,
                Bytes::from(row.get::<_, Vec<u8>>(1)),
            ));
        }
        if page.is_empty() && after != self.records {
            return Err(Error::corrupt("PostgreSQL journal is truncated"));
        }
        Ok(page)
    }
    async fn close(&mut self) -> Result<()> {
        self.client.take();
        if let Some(driver) = self.driver.take() {
            driver
                .await
                .map_err(|e| Error::new(ErrorKind::Unavailable, format!("PostgreSQL driver: {e}")))?
                .map_err(unavailable)?;
        }
        Ok(())
    }
}
