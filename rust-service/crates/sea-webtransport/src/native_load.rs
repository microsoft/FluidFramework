//! Independently consumed load channels over one credit-controlled opening stream.

use std::sync::Arc;

use futures_util::future::{AbortHandle, Abortable};
use tokio::sync::mpsc;

use super::{SeaClientError, SessionStreamBounds};
use crate::{
    client::EventStream,
    protocol::{self, Request, Response},
    transport::BidirectionalStream,
};

/// Cancels the physical reader when neither logical receiver needs it.
struct LoadPump(AbortHandle);

impl Drop for LoadPump {
    fn drop(&mut self) {
        self.0.abort();
    }
}

/// One byte-bounded logical receiver; consumption returns the message's charged bytes.
pub(super) struct LoadReceiver {
    /// Slot capacity derives from the byte window and minimum message charge.
    received: mpsc::Receiver<Response>,
    /// Bounded indirectly by outstanding receive credits on the two channels.
    control: mpsc::UnboundedSender<Request>,
    /// Distinguishes finite content from the live event channel.
    content: bool,
    /// Shared cancellation ownership; the task retains no strong reference.
    _pump: Arc<LoadPump>,
}

impl LoadReceiver {
    /// Receives an item without coupling application consumption of the other channel.
    pub(super) async fn next(&mut self) -> Option<Response> {
        let response = self.received.recv().await?;
        if !matches!(
            response,
            Response::LoadContentComplete
                | Response::LoadContentError { .. }
                | Response::Error { .. }
        ) {
            // A closed control receiver means the terminal outcome is already queued.
            let _ = self.control.send(Request::LoadCredit {
                content: self.content,
                bytes: protocol::load_response_bytes(&response),
            });
        }
        Some(response)
    }
}

impl Drop for LoadReceiver {
    fn drop(&mut self) {
        let _ = self.control.send(if self.content {
            Request::CancelLoadContent
        } else {
            Request::CancelLoadEvents
        });
    }
}

/// Starts receiving immediately, before later author or snapshot handshakes.
pub(super) fn split_load<Stream>(mut stream: EventStream<Stream>) -> (LoadReceiver, LoadReceiver)
where
    Stream: BidirectionalStream + SessionStreamBounds + 'static,
    Stream::Error: Into<SeaClientError> + SessionStreamBounds,
{
    let (events, event_receiver) = mpsc::channel(
        (protocol::LOAD_EVENT_WINDOW_BYTES / protocol::LOAD_MESSAGE_OVERHEAD) as usize + 1,
    );
    let (content, content_receiver) = mpsc::channel(
        (protocol::LOAD_CONTENT_WINDOW_BYTES / protocol::LOAD_MESSAGE_OVERHEAD) as usize + 1,
    );
    let (control, mut commands) = mpsc::unbounded_channel();
    let (abort, registration) = AbortHandle::new_pair();
    let pump = Arc::new(LoadPump(abort));
    let future = async move {
        let result = Abortable::new(async {
            let mut event_bytes = protocol::LOAD_EVENT_WINDOW_BYTES;
            let mut content_bytes = protocol::LOAD_CONTENT_WINDOW_BYTES;
            loop {
                let response = tokio::select! {
                    command = commands.recv() => {
                        let Some(command) = command else { return Ok(()); };
                        if let Request::LoadCredit { content, bytes } = &command {
                            let remaining = if *content { &mut content_bytes } else { &mut event_bytes };
                            *remaining += bytes;
                        }
                        stream.control(&command).await.map_err(SeaClientError::from)?;
                        continue;
                    }
                    response = stream.next() => response.map_err(SeaClientError::from)?,
                };
                let response = response.ok_or_else(|| SeaClientError::new(super::SeaClientErrorReason::UnexpectedResponse))?;
                if matches!(&response, Response::BlobTree { payload, .. } if payload.len() > protocol::LOAD_CONTENT_MAX_ITEM_BYTES) {
                    return Err(SeaClientError::new(super::SeaClientErrorReason::UnexpectedResponse));
                }
                if let Response::Error { kind, message } = response {
                    return Err(SeaClientError::new(super::SeaClientErrorReason::Service(kind, message)));
                }
                let is_content = matches!(response, Response::BlobTree { .. } | Response::LoadContentComplete | Response::LoadContentError { .. });
                let terminal = matches!(response, Response::LoadContentComplete | Response::LoadContentError { .. } | Response::Error { .. });
                let target = if is_content { &content } else { &events };
                if target.is_closed() {
                    continue;
                }
                let remaining = if is_content { &mut content_bytes } else { &mut event_bytes };
                *remaining = remaining.checked_sub(protocol::load_response_bytes(&response))
                    .ok_or_else(|| SeaClientError::new(super::SeaClientErrorReason::UnexpectedResponse))?;
                if !terminal && target.capacity() <= 1 {
                    return Err(SeaClientError::new(super::SeaClientErrorReason::UnexpectedResponse));
                }
                match target.try_send(response) {
                    Ok(()) | Err(mpsc::error::TrySendError::Closed(_)) => {}
                    Err(mpsc::error::TrySendError::Full(_)) => {
                        return Err(SeaClientError::new(super::SeaClientErrorReason::UnexpectedResponse));
                    }
                }
            }
        }, registration).await;
        if let Ok(Err(error)) = result {
            let kind = match error.reason() {
                super::SeaClientErrorReason::Service(kind, _) => *kind,
                _ => protocol::ErrorKind::Unavailable,
            };
            let message = error.to_string();
            let _ = events.try_send(Response::Error {
                kind,
                message: message.clone(),
            });
            let _ = content.try_send(Response::LoadContentError { kind, message });
        }
        let _ = stream.cancel().await;
    };
    #[cfg(not(target_arch = "wasm32"))]
    tokio::spawn(future);
    #[cfg(target_arch = "wasm32")]
    wasm_bindgen_futures::spawn_local(future);
    (
        LoadReceiver {
            received: event_receiver,
            control: control.clone(),
            content: false,
            _pump: Arc::clone(&pump),
        },
        LoadReceiver {
            received: content_receiver,
            control,
            content: true,
            _pump: pump,
        },
    )
}
