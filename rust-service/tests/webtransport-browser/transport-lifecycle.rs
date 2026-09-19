//! Test-only ownership controls for the real browser transport.

#[cfg(target_arch = "wasm32")]
mod browser {
    use sea_webtransport::transport::{ClientTransport, browser::BrowserTransport};
    use wasm_bindgen::prelude::*;

    /// Owns one concrete transport without logical sessions or automatic retry.
    #[wasm_bindgen]
    pub struct LifecycleTransport {
        /// The final Rust owner, released only by the generated `free` method.
        transport: BrowserTransport,
    }

    #[wasm_bindgen]
    impl LifecycleTransport {
        /// Establishes a pinned real connection before transferring ownership to JavaScript.
        pub async fn connect(url: &str, hash: &[u8]) -> Result<LifecycleTransport, JsValue> {
            Ok(Self {
                transport: BrowserTransport::connect(url, hash).await?,
            })
        }

        /// Disconnects without consuming the Rust owner.
        pub fn disconnect(&self) -> Result<(), JsValue> {
            self.transport.disconnect()
        }
    }
}
