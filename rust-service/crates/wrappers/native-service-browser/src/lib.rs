#![doc = "Browser WASM transport for an in-process memory-backed native Fluid service."]
#![cfg(target_arch = "wasm32")]

use std::{path::PathBuf, sync::Arc};

use bytes::Bytes;
use fluid_native_service::{
    NativeService, ProjectedSubscription, ProjectedSubscriptionError, ServiceConfig, StorageMode,
};
use fluid_service_protocol::{
    ErrorCode, Frame, Limits, Message, Request, Response, decode, encode,
};
use js_sys::Uint8Array;
use tokio::sync::Mutex;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
/// In-process implementation of the injected browser client's request transport.
pub struct LocalServiceTransport {
    service: Arc<NativeService>,
    limits: Limits,
}

#[wasm_bindgen]
impl LocalServiceTransport {
    /// Creates an isolated memory-backed service with the supplied FSP4 frame bound.
    #[wasm_bindgen(constructor)]
    #[must_use]
    pub fn new(max_frame_bytes: usize) -> Self {
        let limits = Limits {
            max_frame_bytes,
            ..Limits::default()
        };
        Self {
            service: Arc::new(NativeService::new(
                ServiceConfig::new(PathBuf::new()).with_storage_mode(StorageMode::Memory),
            )),
            limits,
        }
    }

    /// Handles one complete FSP4 request frame without crossing a transport boundary.
    ///
    /// # Errors
    ///
    /// Rejects malformed frames and requests reserved for the subscription path.
    pub async fn request(&self, frame: Uint8Array) -> Result<Uint8Array, JsValue> {
        let Frame {
            request_id,
            message,
        } = decode(&frame.to_vec(), self.limits).map_err(js_error)?;
        let request = match message {
            Message::Request(request @ Request::SubscribeProjected { .. }) => {
                return Err(js_error(format!(
                    "subscription request {request:?} used the unary path"
                )));
            }
            Message::Request(request) => request,
            Message::Response(_) => return Err(js_error("expected an FSP4 request frame")),
        };
        let response = encode(
            &Frame {
                request_id,
                message: Message::Response(self.service.handle(request).await),
            },
            self.limits,
        )
        .map_err(js_error)?;
        Ok(Uint8Array::from(response.as_ref()))
    }

    /// Opens an in-process projected-operation subscription from one complete FSP4 frame.
    ///
    /// # Errors
    ///
    /// Rejects malformed frames and non-subscription requests.
    #[allow(clippy::needless_pass_by_value)] // wasm-bindgen exports JS arrays by value.
    pub fn subscribe(&self, frame: Uint8Array) -> Result<LocalProjectedSubscription, JsValue> {
        let Frame {
            request_id,
            message,
        } = decode(&frame.to_vec(), self.limits).map_err(js_error)?;
        let Message::Request(Request::SubscribeProjected { document, after }) = message else {
            return Err(js_error("expected an FSP4 projected-subscription request"));
        };
        Ok(LocalProjectedSubscription {
            service: Arc::clone(&self.service),
            request_id,
            document,
            after,
            limits: self.limits,
            subscription: Mutex::new(None),
        })
    }

    /// Accepts the optional cancellation hook; unary in-process requests are not interruptible.
    pub fn cancel(&self) {}

    /// Accepts the optional disconnect hook; the in-process service has no connection to close.
    pub fn disconnect(&self) {}

    /// Accepts the optional shutdown hook; dropping the transport owns service teardown.
    pub fn shutdown(&self) {}
}

#[wasm_bindgen]
/// Lazily initialized projected-operation subscription for the in-process service.
pub struct LocalProjectedSubscription {
    service: Arc<NativeService>,
    request_id: u64,
    document: Bytes,
    after: Option<Bytes>,
    limits: Limits,
    subscription: Mutex<Option<ProjectedSubscription>>,
}

#[wasm_bindgen]
impl LocalProjectedSubscription {
    /// Returns the next projected operation as one complete FSP4 response frame.
    ///
    /// # Errors
    ///
    /// Rejects only when response framing fails.
    pub async fn next(&self) -> Result<Uint8Array, JsValue> {
        let mut subscription = self.subscription.lock().await;
        if subscription.is_none() {
            match self
                .service
                .subscribe_projected(self.document.clone(), self.after.clone())
                .await
            {
                Ok(created) => *subscription = Some(created),
                Err(code) => return self.response(Response::Error(code)),
            }
        }
        let Some(subscription) = subscription.as_mut() else {
            return Err(js_error("subscription initialization failed"));
        };
        let response = match subscription.next().await {
            Ok(operation) => Response::ProjectedOperation(operation),
            Err(ProjectedSubscriptionError::Cancelled) => Response::Error(ErrorCode::Unavailable),
            Err(ProjectedSubscriptionError::Service(code)) => Response::Error(code),
        };
        self.response(response)
    }

    /// Cancels the initialized subscription, or does nothing before the first read.
    pub async fn cancel(&self) {
        if let Some(subscription) = self.subscription.lock().await.as_ref() {
            subscription.cancel();
        }
    }
}

impl LocalProjectedSubscription {
    fn response(&self, response: Response) -> Result<Uint8Array, JsValue> {
        let encoded = encode(
            &Frame {
                request_id: self.request_id,
                message: Message::Response(response),
            },
            self.limits,
        )
        .map_err(js_error)?;
        Ok(Uint8Array::from(encoded.as_ref()))
    }
}

fn js_error(error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&error.to_string())
}
