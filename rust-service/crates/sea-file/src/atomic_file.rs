//! Checksummed whole-value publication for small document metadata and immutable content.

use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use sea_core::BlobId;

use crate::journal::FileStorageError;

/// Appends a suffix without replacing the destination's existing extension.
fn pending(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(".pending");
    PathBuf::from(name)
}

/// Reads only the published value; incomplete unpublished replacements are ignored.
pub(crate) fn read(path: &Path) -> Result<Option<Vec<u8>>, FileStorageError> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if bytes.len() < 32 || BlobId::for_bytes(&bytes[32..]).as_bytes() != &bytes[..32] {
        return Err(FileStorageError::Corrupt("atomic value checksum"));
    }
    Ok(Some(bytes[32..].to_vec()))
}

/// Publishes content before its name and reports all write failures as uncertain.
pub(crate) fn write(path: &Path, value: &[u8], durable: bool) -> Result<(), FileStorageError> {
    let result = (|| -> std::io::Result<()> {
        let temporary = pending(path);
        let file = stage(path, value)?;
        if durable {
            file.sync_all()?;
        }
        fs::rename(temporary, path)?;
        if durable {
            File::open(path.parent().ok_or(std::io::ErrorKind::InvalidInput)?)?.sync_all()?;
        }
        Ok(())
    })();
    result.map_err(|_| FileStorageError::Ambiguous)
}

/// Writes complete unpublished bytes without making them discoverable.
pub(crate) fn stage(path: &Path, value: &[u8]) -> std::io::Result<File> {
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(pending(path))?;
    file.write_all(BlobId::for_bytes(value).as_bytes())?;
    file.write_all(value)?;
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn torn_unpublished_values_never_replace_the_published_state() {
        let root = std::env::temp_dir().join(format!("sea-atomic-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("checkpoint");
        write(&path, b"previous", true).unwrap();
        let mut replacement = BlobId::for_bytes(b"replacement").as_bytes().to_vec();
        replacement.extend_from_slice(b"replacement");
        for length in 0..=replacement.len() {
            fs::write(pending(&path), &replacement[..length]).unwrap();
            assert_eq!(read(&path).unwrap().unwrap(), b"previous");
        }
        fs::rename(pending(&path), &path).unwrap();
        assert_eq!(read(&path).unwrap().unwrap(), b"replacement");
        fs::remove_dir_all(root).unwrap();
    }
}
