//! Native and browser signal pumping, independent of archive progress.

use crate::{
    client::{Client, ClientError, ClientStateError, SignalStream},
    native::{SeaClientError, SessionStreamBounds},
    protocol,
    transport::{BidirectionalStream, ClientTransport},
};
use async_trait::async_trait;
use futures_util::future::{AbortHandle, Abortable};
use sea_core::{
    SeaService,
    signals::{SeaSignals, SignalEvent, SignalSubmission},
};
use std::sync::Arc;
use tokio::sync::{Mutex, mpsc, oneshot, watch};

/// Document-bound messaging access sharing transport but not author authority.
pub struct SignalService<Transport> {
    /// Connection and codec owner.
    client: Arc<Client<Transport>>,
    /// Existing document identity.
    document: bytes::Bytes,
}

impl<Transport> SignalService<Transport> {
    /// Creates messaging access from an already authorized document route.
    pub(crate) const fn new(client: Arc<Client<Transport>>, document: bytes::Bytes) -> Self {
        Self { client, document }
    }
}

impl<Transport: sea_core::SessionBounds> SeaService for SignalService<Transport> {
    type Error = SeaClientError;
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl<Transport> sea_core::signals::SeaSignalService for SignalService<Transport>
where
    Transport: ClientTransport + sea_core::SessionBounds + 'static,
    Transport::Stream: SessionStreamBounds + 'static,
    Transport::Error: Into<SeaClientError> + SessionStreamBounds,
{
    type Connection = SignalClient;
    async fn open_signals(
        &self,
        member: sea_core::signals::SignalMember,
    ) -> Result<Arc<SignalClient>, SeaClientError> {
        let mut stream = self
            .client
            .open_signal_stream(protocol::signals::OpenSignals {
                version: protocol::PROTOCOL_VERSION,
                document: self.document.to_vec(),
                member: member.into(),
                datagrams: self.client.supports_datagrams(),
            })
            .await?;
        let initial = stream.next().await?;
        if !matches!(initial, protocol::signals::Event::Members(_)) {
            stream.cancel().await;
            return Err(SeaClientError::Service(
                protocol::ErrorKind::Rejected,
                "signal registration must start with a membership snapshot".to_owned(),
            ));
        }
        Ok(SignalClient::start(stream, self.client.clone(), initial))
    }
}

/// One admitted submission and its completion, never automatically retried.
struct Command {
    /// Opaque outbound message.
    submission: SignalSubmission,
    /// Admission result, not recipient acknowledgement.
    response: oneshot::Sender<Result<(), SeaClientError>>,
}

/// A live reliable stream with bounded application queues and optional best-effort messages.
pub struct SignalClient {
    /// Bounded submission admission.
    commands: mpsc::Sender<Command>,
    /// Single consumer of membership and application events.
    events: Mutex<mpsc::Receiver<SignalEvent>>,
    /// Independent terminal state cannot be hidden by a full event queue.
    terminal: watch::Sender<Option<String>>,
    /// Cancels the sole stream owner.
    task: AbortHandle,
}

impl SignalClient {
    /// Starts the shared pump; dropping its final owner cancels remote membership.
    pub(crate) fn start<Transport>(
        mut stream: SignalStream<Transport::Stream>,
        client: Arc<Client<Transport>>,
        initial: protocol::signals::Event,
    ) -> Arc<Self>
    where
        Transport: ClientTransport + sea_core::SessionBounds + 'static,
        Transport::Stream: BidirectionalStream + SessionStreamBounds + 'static,
        Transport::Error: Into<SeaClientError> + SessionStreamBounds,
    {
        let (commands, mut requests) = mpsc::channel::<Command>(64);
        let (events, receiver) = mpsc::channel::<SignalEvent>(256);
        let _ = events.try_send(initial.into());
        let (terminal, _) = watch::channel(None);
        let failed = terminal.clone();
        let (task, registration) = AbortHandle::new_pair();
        let future = async move {
            let result = Abortable::new(async {
                loop {
                    tokio::select! {
                        command = requests.recv() => {
                            let Some(command) = command else { break Ok(()); };
                            let submission: protocol::signals::Submission = command.submission.into();
                            if submission.best_effort {
                                match client.send_signal_datagram(&submission).await {
                                    Ok(true) => { let _ = command.response.send(Ok(())); continue; }
                                    Ok(false) => {},
                                    Err(error) => {
                                        let error = SeaClientError::from(error);
                                        let diagnostic = error.to_string();
                                        let _ = command.response.send(Err(error));
                                        break Err(diagnostic);
                                    }
                                }
                            }
                            let result = stream.request(protocol::Request::SendSignal(submission), |event| {
                                deliver(&events, event).map_err(|()| ClientError::State(ClientStateError::Closed))
                            }).await.map_err(SeaClientError::from);
                            let error = result.as_ref().err().map(ToString::to_string);
                            let _ = command.response.send(result);
                            if let Some(error) = error { break Err(error); }
                        }
                        result = stream.next() => match result {
                            Ok(event) => if deliver(&events, event).is_err() { break Err("signal receiver queue overflowed".to_owned()); },
                            Err(error) => break Err(SeaClientError::from(error).to_string()),
                        },
                        result = client.receive_signal_datagram() => match result {
                            Ok(event) => if deliver(&events, event).is_err() { break Err("signal receiver is closed".to_owned()); },
                            Err(error) => break Err(SeaClientError::from(error).to_string()),
                        }
                    }
                }
            }, registration).await;
            if let Ok(Err(error)) = result {
                failed.send_replace(Some(error));
            }
            stream.cancel().await;
        };
        #[cfg(not(target_arch = "wasm32"))]
        tokio::spawn(future);
        #[cfg(target_arch = "wasm32")]
        wasm_bindgen_futures::spawn_local(future);
        Arc::new(Self {
            commands,
            events: Mutex::new(receiver),
            terminal,
            task,
        })
    }
}

/// Queues membership and reliable messages, dropping only explicitly best-effort overflow.
fn deliver(events: &mpsc::Sender<SignalEvent>, event: protocol::signals::Event) -> Result<(), ()> {
    let best_effort = matches!(&event, protocol::signals::Event::Message { submission, .. } if submission.best_effort);
    match events.try_send(event.into()) {
        Ok(()) => Ok(()),
        Err(mpsc::error::TrySendError::Full(_)) if best_effort => Ok(()),
        Err(_) => Err(()),
    }
}

impl Drop for SignalClient {
    fn drop(&mut self) {
        self.task.abort();
    }
}
impl SeaService for SignalClient {
    type Error = SeaClientError;
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl SeaSignals for SignalClient {
    async fn send_signal(&self, submission: SignalSubmission) -> Result<(), SeaClientError> {
        if self.terminal.borrow().is_some() {
            return Err(SeaClientError::Closed);
        }
        let (response, received) = oneshot::channel();
        self.commands
            .try_send(Command {
                submission,
                response,
            })
            .map_err(|_| {
                SeaClientError::Service(
                    protocol::ErrorKind::Unavailable,
                    "signal submission queue is full or closed".to_owned(),
                )
            })?;
        received.await.map_err(|_| SeaClientError::Closed)?
    }
    async fn next_signal(&self) -> Result<Option<SignalEvent>, SeaClientError> {
        let mut terminal = self.terminal.subscribe();
        let mut events = self.events.try_lock().map_err(|_| {
            SeaClientError::Service(
                protocol::ErrorKind::Conflict,
                "signal receive is already pending".to_owned(),
            )
        })?;
        loop {
            if let Some(error) = terminal.borrow().clone() {
                return if error.is_empty() {
                    Ok(None)
                } else {
                    Err(SeaClientError::Service(
                        protocol::ErrorKind::Unavailable,
                        error,
                    ))
                };
            }
            tokio::select! { biased; _ = terminal.changed() => {}, event = events.recv() => return event.map(Some).ok_or(SeaClientError::Closed), }
        }
    }
    async fn close_signals(&self) -> Result<(), SeaClientError> {
        self.terminal.send_replace(Some(String::new()));
        self.task.abort();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn receive_cancellation_preserves_events_and_close_wakes_the_pending_receiver() {
        use futures_util::FutureExt as _;

        let (commands, _requests) = mpsc::channel(1);
        let (events, receiver) = mpsc::channel(1);
        let (terminal, _) = watch::channel(None);
        let client = SignalClient {
            commands,
            events: Mutex::new(receiver),
            terminal,
            task: AbortHandle::new_pair().0,
        };
        {
            let pending = client.next_signal();
            tokio::pin!(pending);
            assert!(pending.as_mut().now_or_never().is_none());
            assert!(matches!(
                client.next_signal().await,
                Err(SeaClientError::Service(protocol::ErrorKind::Conflict, _))
            ));
        }
        let event = SignalEvent::Members(Vec::new());
        events.try_send(event.clone()).unwrap();
        assert_eq!(client.next_signal().await.unwrap(), Some(event));
        let pending = client.next_signal();
        tokio::pin!(pending);
        assert!(pending.as_mut().now_or_never().is_none());
        client.close_signals().await.unwrap();
        assert!(pending.await.unwrap().is_none());
        assert!(matches!(
            client
                .send_signal(SignalSubmission {
                    target: None,
                    payload: bytes::Bytes::new(),
                    delivery: sea_core::signals::SignalDelivery::Reliable,
                })
                .await,
            Err(SeaClientError::Closed)
        ));
    }

    #[tokio::test]
    async fn terminal_failure_is_not_hidden_by_queued_events() {
        let (commands, _requests) = mpsc::channel(1);
        let (events, receiver) = mpsc::channel(1);
        let (terminal, _) = watch::channel(Some("overflow".to_owned()));
        events.try_send(SignalEvent::Members(Vec::new())).unwrap();
        let client = SignalClient {
            commands,
            events: Mutex::new(receiver),
            terminal,
            task: AbortHandle::new_pair().0,
        };
        assert!(matches!(
            client.next_signal().await,
            Err(SeaClientError::Service(protocol::ErrorKind::Unavailable, message))
                if message == "overflow"
        ));
    }

    #[test]
    fn client_overflow_drops_only_best_effort_messages() {
        let (sender, mut receiver) = mpsc::channel(1);
        let member = protocol::signals::Member {
            id: vec![1],
            metadata: vec![],
        };
        assert_eq!(
            deliver(
                &sender,
                protocol::signals::Event::Members(vec![member.clone()])
            ),
            Ok(())
        );
        let message = |best_effort| protocol::signals::Event::Message {
            sender: vec![1],
            submission: protocol::signals::Submission {
                target: None,
                payload: vec![2],
                best_effort,
            },
        };
        assert_eq!(deliver(&sender, message(true)), Ok(()));
        assert_eq!(deliver(&sender, message(false)), Err(()));
        assert_eq!(
            deliver(&sender, protocol::signals::Event::Joined(member)),
            Err(())
        );
        assert!(matches!(receiver.try_recv(), Ok(SignalEvent::Members(_))));
        assert!(receiver.try_recv().is_err());
    }
}
