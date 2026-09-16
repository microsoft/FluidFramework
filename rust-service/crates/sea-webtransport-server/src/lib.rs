#![doc = "Native Sea WebTransport hosting and protocol dispatch."]

mod dispatch;
pub mod host;
mod server;

pub use dispatch::SessionDispatcher;
pub use host::{BuiltInSeaHost, StorageMode};
pub use server::{
    MeasurementHandle, SeaConnectionService, SeaResponseStream, SeaServiceHost,
    ShutdownDisposition, ShutdownHandle, ShutdownMode, ShutdownOutcome, TransportConfig,
    TransportMeasurement, WebTransportError, WebTransportServer,
};
