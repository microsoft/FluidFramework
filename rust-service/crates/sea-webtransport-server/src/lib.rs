#![doc = include_str!("../README.md")]

mod dispatch;
pub mod host;
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

pub use dispatch::SessionDispatcher;
pub use host::BuiltInSeaHost;
pub use resource_policy::ReaderShedding;
pub use server::{
    LivenessPolicy, MeasurementHandle, SeaConnectionService, SeaResponseStream, SeaServiceHost,
    ShutdownDisposition, ShutdownHandle, ShutdownMode, ShutdownOutcome, TransportConfig,
    TransportMeasurement, WebTransportError, WebTransportServer,
};
pub use setup::{
    DocumentContext, LiveCacheRequired, PassThrough, SessionDecorator, SessionSetup, StorageSetup,
};
