#![doc = "Browser WASM transport for an in-process memory-backed native Fluid service."]
#![cfg(target_arch = "wasm32")]

use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use bytes::Bytes;
use sea_service::{
    NativeService, ProjectedSubscription, ProjectedSubscriptionCancellation,
    ProjectedSubscriptionError, ServiceConfig, StorageMode,
};
use sea_protocol::{
    ErrorCode, Frame, Limits, Message, Request, Response, decode, encode,
};
use js_sys::{Array, Uint8Array};
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
            cancellation: Mutex::new(None),
            cancelled: AtomicBool::new(false),
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
    cancellation: Mutex<Option<ProjectedSubscriptionCancellation>>,
    cancelled: AtomicBool,
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
                Ok(created) => {
                    let cancellation = created.cancellation_handle();
                    *self.cancellation.lock().await = Some(cancellation.clone());
                    if self.cancelled.load(Ordering::Acquire) {
                        cancellation.cancel();
                    }
                    *subscription = Some(created);
                }
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

    /// Returns a bounded batch beginning with the next projected operation.
    ///
    /// # Errors
    ///
    /// Rejects invalid limits, subscription failures, and response framing failures.
    #[wasm_bindgen(js_name = nextBatch)]
    pub async fn next_batch(
        &self,
        max_operations: usize,
        max_payload_bytes: usize,
    ) -> Result<Array, JsValue> {
        let mut subscription = self.subscription.lock().await;
        if subscription.is_none() {
            match self
                .service
                .subscribe_projected(self.document.clone(), self.after.clone())
                .await
            {
                Ok(created) => {
                    let cancellation = created.cancellation_handle();
                    *self.cancellation.lock().await = Some(cancellation.clone());
                    if self.cancelled.load(Ordering::Acquire) {
                        cancellation.cancel();
                    }
                    *subscription = Some(created);
                }
                Err(code) => return Err(js_error(format!("subscription failed: {code:?}"))),
            }
        }
        let Some(subscription) = subscription.as_mut() else {
            return Err(js_error("subscription initialization failed"));
        };
        let operations = subscription
            .next_batch(max_operations, max_payload_bytes)
            .await
            .map_err(|error| match error {
                ProjectedSubscriptionError::Cancelled => js_error("subscription is cancelled"),
                ProjectedSubscriptionError::Service(code) => {
                    js_error(format!("subscription failed: {code:?}"))
                }
            })?;
        let frames = Array::new();
        for operation in operations {
            frames.push(
                &self
                    .response(Response::ProjectedOperation(operation))?
                    .into(),
            );
        }
        Ok(frames)
    }

    /// Cancels the subscription and wakes an initialized pending read.
    pub async fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
        if let Some(cancellation) = self.cancellation.lock().await.as_ref() {
            cancellation.cancel();
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
