//! Neutral signal factories and JavaScript connection ownership.

use crate::{
    bindings::{service_error, set},
    session::BindingError,
};
use async_trait::async_trait;
use bytes::Bytes;
use js_sys::{Array, Object, Uint8Array};
use sea_core::{
    SeaService,
    signals::{
        SeaSignalService, SeaSignals as Signals, SignalDelivery, SignalEvent, SignalMember,
        SignalSubmission,
    },
};
use std::{rc::Rc, sync::Arc};
use wasm_bindgen::prelude::*;

/// Object-safe connection without concrete transport or relay errors.
pub(crate) type BindingSignals = dyn Signals<Error = BindingError>;

/// Object-safe document-scoped factory.
#[async_trait(?Send)]
pub(crate) trait SignalFactory {
    /// Registers one live signal identity and metadata.
    async fn open(&self, member: SignalMember) -> Result<Rc<BindingSignals>, BindingError>;
}

/// Adapts an existing neutral factory without exposing transport specifics.
pub(crate) struct FactoryAdapter<Factory>(pub(crate) Factory);

#[async_trait(?Send)]
impl<Factory: SeaSignalService> SignalFactory for FactoryAdapter<Factory>
where
    Factory::Connection: 'static,
{
    async fn open(&self, member: SignalMember) -> Result<Rc<BindingSignals>, BindingError> {
        let connection = self
            .0
            .open_signals(member)
            .await
            .map_err(|error| BindingError::from_error(&error))?;
        Ok(Rc::new(ConnectionAdapter(connection)))
    }
}

/// Preserves concrete connection behavior while erasing error types.
struct ConnectionAdapter<Connection>(Arc<Connection>);
impl<Connection: Signals> SeaService for ConnectionAdapter<Connection> {
    type Error = BindingError;
}
#[async_trait(?Send)]
impl<Connection: Signals> Signals for ConnectionAdapter<Connection> {
    async fn send_signal(&self, submission: SignalSubmission) -> Result<(), BindingError> {
        self.0
            .send_signal(submission)
            .await
            .map_err(|error| BindingError::from_error(&error))
    }
    async fn next_signal(&self) -> Result<Option<SignalEvent>, BindingError> {
        self.0
            .next_signal()
            .await
            .map_err(|error| BindingError::from_error(&error))
    }
    async fn close_signals(&self) -> Result<(), BindingError> {
        self.0
            .close_signals()
            .await
            .map_err(|error| BindingError::from_error(&error))
    }
}

/// One independently closable ephemeral messaging connection.
#[wasm_bindgen]
pub struct SeaSignals {
    /// Shared connection retained across pending JavaScript operations.
    pub(crate) inner: Rc<BindingSignals>,
}

#[wasm_bindgen]
impl SeaSignals {
    /// Admits an opaque message; completion is not remote receipt.
    ///
    /// # Errors
    /// Rejects invalid input, unavailable admission, or a closed connection.
    pub async fn send(
        &self,
        payload: &[u8],
        target: Option<Vec<u8>>,
        best_effort: bool,
    ) -> Result<(), JsValue> {
        self.inner
            .send_signal(SignalSubmission {
                payload: Bytes::copy_from_slice(payload),
                target: target.map(Bytes::from),
                delivery: if best_effort {
                    SignalDelivery::BestEffort
                } else {
                    SignalDelivery::Reliable
                },
            })
            .await
            .map_err(|error| service_error(&error))
    }
    /// Receives a membership observation or opaque message; concurrent reads are rejected.
    ///
    /// # Errors
    /// Reports concurrent reads, terminal delivery failures, or result encoding errors.
    pub async fn next(&self) -> Result<JsValue, JsValue> {
        let Some(event) = self
            .inner
            .next_signal()
            .await
            .map_err(|error| service_error(&error))?
        else {
            return Ok(JsValue::UNDEFINED);
        };
        let result = Object::new();
        match event {
            SignalEvent::Members(members) => {
                set(&result, "kind", "members")?;
                let values = Array::new();
                for member in members {
                    values.push(&member_result(&member)?);
                }
                set(&result, "members", values)?;
            }
            SignalEvent::Joined(member) => {
                set(&result, "kind", "joined")?;
                set(&result, "member", member_result(&member)?)?;
            }
            SignalEvent::Left(id) => {
                set(&result, "kind", "left")?;
                set(&result, "id", Uint8Array::from(id.as_ref()))?;
            }
            SignalEvent::Message(message) => {
                set(&result, "kind", "message")?;
                set(&result, "sender", Uint8Array::from(message.sender.as_ref()))?;
                set(
                    &result,
                    "payload",
                    Uint8Array::from(message.submission.payload.as_ref()),
                )?;
                set(
                    &result,
                    "target",
                    message
                        .submission
                        .target
                        .map_or(JsValue::UNDEFINED, |target| {
                            Uint8Array::from(target.as_ref()).into()
                        }),
                )?;
                set(
                    &result,
                    "delivery",
                    if message.submission.delivery == SignalDelivery::Reliable {
                        "reliable"
                    } else {
                        "bestEffort"
                    },
                )?;
            }
        }
        Ok(result.into())
    }
    /// Ends signal membership and wakes pending reads, without closing archive access.
    ///
    /// # Errors
    /// Preserves any concrete service failure while releasing membership.
    pub async fn close(&self) -> Result<(), JsValue> {
        self.inner
            .close_signals()
            .await
            .map_err(|error| service_error(&error))
    }
}

/// Copies connection metadata into an ordinary JavaScript value.
fn member_result(member: &SignalMember) -> Result<JsValue, JsValue> {
    let result = Object::new();
    set(&result, "id", Uint8Array::from(member.id.as_ref()))?;
    set(
        &result,
        "metadata",
        Uint8Array::from(member.metadata.as_ref()),
    )?;
    Ok(result.into())
}
