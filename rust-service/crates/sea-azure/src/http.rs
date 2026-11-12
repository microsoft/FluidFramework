//! Minimal Azure Blob REST client with Shared Key signing and no mutation retries.

use base64::{Engine, engine::general_purpose::STANDARD};
use bytes::{Bytes, BytesMut};
use hmac::{Hmac, Mac};
use reqwest::{Client, Method, Response, StatusCode, Url};
use sea_core::ErrorKind;
use sea_remote::{Error, Result};
use sha2::Sha256;
use std::{
    collections::BTreeMap,
    time::{Duration, SystemTime},
};

/// Authenticated endpoint; credentials are deliberately not printable.
pub(crate) struct Http {
    /// Connection reuse without automatic retries or redirects.
    client: Client,
    /// Account endpoint including the emulator's account path when applicable.
    endpoint: Url,
    /// Container namespace configured by the caller.
    container: String,
    /// Account name used in the signing scope.
    account: String,
    /// Decoded Shared Key secret.
    key: Vec<u8>,
}

/// Lower-case request headers, also used to build the canonical signature.
pub(crate) type Headers = BTreeMap<String, String>;

impl Http {
    /// Validates endpoint and signing material without making a network request.
    pub(crate) fn new(
        endpoint: &str,
        account: String,
        key: &str,
        container: String,
    ) -> Result<Self> {
        let endpoint =
            Url::parse(endpoint).map_err(|e| Error::rejected(format!("Azure endpoint: {e}")))?;
        if endpoint.query().is_some()
            || endpoint.fragment().is_some()
            || !endpoint.username().is_empty()
            || endpoint.password().is_some()
        {
            return Err(Error::rejected(
                "Azure endpoint must not contain credentials, query, or fragment",
            ));
        }
        let local = matches!(
            endpoint.host_str(),
            Some("127.0.0.1" | "localhost" | "[::1]" | "::1")
        );
        if endpoint.scheme() != "https" && !(endpoint.scheme() == "http" && local) {
            return Err(Error::rejected(
                "Azure requires HTTPS except for a localhost emulator",
            ));
        }
        if container.len() < 3
            || container.len() > 63
            || !container
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
            || container.starts_with('-')
            || container.ends_with('-')
            || container.contains("--")
        {
            return Err(Error::rejected("invalid Azure container name"));
        }
        if account.is_empty() || !account.bytes().all(|c| c.is_ascii_alphanumeric()) {
            return Err(Error::rejected("invalid Azure account name"));
        }
        let key = STANDARD
            .decode(key)
            .map_err(|_| Error::rejected("Azure account key is not base64"))?;
        if key.is_empty() {
            return Err(Error::rejected("Azure account key is empty"));
        }
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .build()
            .map_err(|e| {
                Error::new(
                    ErrorKind::Unavailable,
                    format!("Azure HTTP client: {}", e.without_url()),
                )
            })?;
        Ok(Self {
            client,
            endpoint,
            container,
            account,
            key,
        })
    }

    /// Sends exactly one signed request; the caller interprets service status codes.
    pub(crate) async fn request(
        &self,
        method: Method,
        name: &str,
        query: &[(&str, &str)],
        mut headers: Headers,
        body: Bytes,
    ) -> Result<Response> {
        let mut url = self.endpoint.clone();
        {
            let mut path = url
                .path_segments_mut()
                .map_err(|()| Error::rejected("Azure endpoint cannot contain a path"))?;
            path.pop_if_empty().push(&self.container);
            if !name.is_empty() {
                path.extend(name.split('/'));
            }
        }
        url.query_pairs_mut().extend_pairs(query.iter().copied());
        headers.insert(
            "x-ms-date".into(),
            httpdate::fmt_http_date(SystemTime::now()),
        );
        headers.insert("x-ms-version".into(), "2021-12-02".into());
        headers.insert("content-length".into(), body.len().to_string());
        let mut canonical = format!("{}\n", method.as_str());
        for field in [
            "content-encoding",
            "content-language",
            "content-length",
            "content-md5",
            "content-type",
            "date",
            "if-modified-since",
            "if-match",
            "if-none-match",
            "if-unmodified-since",
            "range",
        ] {
            if let Some(value) = headers.get(field)
                && (field != "content-length" || value != "0")
            {
                canonical.push_str(value);
            }
            canonical.push('\n');
        }
        for (key, value) in &headers {
            if key.starts_with("x-ms-") {
                canonical.push_str(key);
                canonical.push(':');
                canonical.push_str(value);
                canonical.push('\n');
            }
        }
        canonical.push('/');
        canonical.push_str(&self.account);
        canonical.push_str(url.path());
        for (key, value) in query.iter().copied().collect::<BTreeMap<_, _>>() {
            canonical.push('\n');
            canonical.push_str(key);
            canonical.push(':');
            canonical.push_str(value);
        }
        let mut mac = Hmac::<Sha256>::new_from_slice(&self.key)
            .map_err(|_| Error::rejected("Azure signing key"))?;
        mac.update(canonical.as_bytes());
        let authorization = format!(
            "SharedKey {}:{}",
            self.account,
            STANDARD.encode(mac.finalize().into_bytes())
        );
        let mut request = self
            .client
            .request(method, url)
            .header("Authorization", authorization);
        for (key, value) in headers {
            request = request.header(key, value);
        }
        request.body(body).send().await.map_err(|e| {
            Error::new(
                ErrorKind::Ambiguous,
                format!("Azure request failed: {:?}", e.without_url()),
            )
        })
    }

    /// Checks the exact service response without treating unrelated failures as success.
    pub(crate) fn expect(response: Response, expected: StatusCode) -> Result<Response> {
        if response.status() == expected {
            return Ok(response);
        }
        let code = response
            .headers()
            .get("x-ms-error-code")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("unspecified");
        let kind = match response.status().as_u16() {
            409 | 412 => ErrorKind::Conflict,
            400 | 401 | 403 | 404 | 413 => ErrorKind::Rejected,
            _ => ErrorKind::Ambiguous,
        };
        Err(Error::new(
            kind,
            format!(
                "Azure HTTP {} ({code}); expected {expected}",
                response.status()
            ),
        ))
    }

    /// Collects a bounded response, including responses without a declared length.
    pub(crate) async fn body(mut response: Response, maximum: usize) -> Result<Bytes> {
        let mut bytes = BytesMut::new();
        while let Some(chunk) = response.chunk().await.map_err(|e| {
            Error::new(
                ErrorKind::Unavailable,
                format!("Azure response: {}", e.without_url()),
            )
        })? {
            if chunk.len() > maximum.saturating_sub(bytes.len()) {
                return Err(Error::corrupt("Azure response exceeds storage bound"));
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes.freeze())
    }

    /// Acquires, renews, breaks, or releases a service-enforced blob lease.
    pub(crate) async fn lease(&self, name: &str, action: &str, id: &str) -> Result<()> {
        let mut headers = Headers::from([("x-ms-lease-action".into(), action.into())]);
        let expected = match action {
            "acquire" => {
                headers.insert("x-ms-lease-duration".into(), "60".into());
                headers.insert("x-ms-proposed-lease-id".into(), id.into());
                StatusCode::CREATED
            }
            "break" => {
                headers.insert("x-ms-lease-break-period".into(), "0".into());
                StatusCode::ACCEPTED
            }
            _ => {
                headers.insert("x-ms-lease-id".into(), id.into());
                StatusCode::OK
            }
        };
        let response = self
            .request(
                Method::PUT,
                name,
                &[("comp", "lease")],
                headers,
                Bytes::new(),
            )
            .await?;
        if action == "break"
            && response.status() == StatusCode::CONFLICT
            && response
                .headers()
                .get("x-ms-error-code")
                .is_some_and(|code| code == "LeaseNotPresentWithLeaseOperation")
        {
            return Ok(());
        }
        Self::expect(response, expected)?;
        Ok(())
    }
}
