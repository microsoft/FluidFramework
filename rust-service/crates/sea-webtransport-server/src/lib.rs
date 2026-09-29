#![doc = include_str!("../README.md")]

pub mod host;
pub mod protocol;
mod resource_policy;
mod server;
pub mod setup;
mod stream;
#[cfg(feature = "websocket-stream")]
mod websocket;
#[cfg(feature = "websocket-stream")]
mod websocket_io;
#[cfg(feature = "websocket-stream")]
pub use websocket::WebSocketServer;

pub use host::{DocumentHost, DocumentHostError, HostError};
pub use protocol::{
    SeaConnectionService, SeaProtocolHost, SeaResponseStream, SeaServiceHost, SessionDispatcher,
};
pub use resource_policy::ReaderShedding;
pub use server::{
    LivenessPolicy, MeasurementHandle, ShutdownDisposition, ShutdownHandle, ShutdownMode,
    ShutdownOutcome, TransportConfig, TransportMeasurement, WebTransportError, WebTransportServer,
};
pub use setup::{
    DocumentContext, LiveCacheRequired, PassThrough, SessionDecorator, SessionSetup, StorageSetup,
};
