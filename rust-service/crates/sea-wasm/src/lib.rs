#![doc = include_str!("../README.md")]

/// Shared typed session adapter used by generated bindings.
pub mod session;

#[cfg(target_arch = "wasm32")]
mod bindings;
#[cfg(target_arch = "wasm32")]
mod signals;
#[cfg(target_arch = "wasm32")]
pub use bindings::*;
#[cfg(target_arch = "wasm32")]
pub use signals::SeaSignals;
