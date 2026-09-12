#![doc = "Transport-neutral lifecycle policy and native helpers for Fluid service clients."]

use bytes::Bytes;
use fluid_service_protocol::{
    Acknowledgement, ErrorCode, Reference, Request, Response, Submission, SubmissionDisposition,
};
use futures_util::TryStreamExt;
use snapshotted_stream_core::{
    AppendStream, PublishedSnapshot, Snapshot, SnapshotPosition, SnapshotStore,
};
use thiserror::Error;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LifecycleState {
    Disconnected,
    Connecting,
    Connected,
    Submitting,
    Recovering,
    Ambiguous,
    Closed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingSubmission {
    pub session: Bytes,
    pub submission: Bytes,
    pub local_sequence_number: u64,
    pub reference: Reference,
    pub payload: Bytes,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubmissionAcknowledgement {
    pub disposition: SubmissionDisposition,
    pub position: Bytes,
    pub sequence_number: u64,
    pub minimum_reference: Reference,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LifecycleEvent {
    Connected,
    SessionRejected(ErrorCode),
    SubmissionAcknowledged(SubmissionAcknowledgement),
    SubmissionRejected(ErrorCode),
    SubmissionUncertain(ErrorCode),
}

#[derive(Clone, Debug, Error, Eq, PartialEq)]
pub enum LifecycleError {
    #[error("cannot {action} while client is {state:?}")]
    InvalidTransition {
        state: LifecycleState,
        action: &'static str,
    },
    #[error("reconnect requires a fresh session identity")]
    SessionNotFresh,
    #[error("a pending submission already exists")]
    PendingSubmissionExists,
    #[error("there is no pending submission")]
    NoPendingSubmission,
    #[error("regeneration requires a fresh submission identity")]
    SubmissionIdentityNotFresh,
    #[error("response does not match the operation in state {0:?}")]
    UnexpectedResponse(LifecycleState),
}

/// An explicit native service-client lifecycle with caller-owned transport and retry policy.
pub struct NativeClient {
    document: Bytes,
    writer: Bytes,
    state: LifecycleState,
    session: Option<Bytes>,
    used_sessions: Vec<Bytes>,
    pending: Option<PendingSubmission>,
}

impl NativeClient {
    #[must_use]
    pub fn new(document: Bytes, writer: Bytes) -> Self {
        Self {
            document,
            writer,
            state: LifecycleState::Disconnected,
            session: None,
            used_sessions: Vec::new(),
            pending: None,
        }
    }

    #[must_use]
    pub fn state(&self) -> LifecycleState {
        self.state
    }

    #[must_use]
    pub fn pending(&self) -> Option<&PendingSubmission> {
        self.pending.as_ref()
    }

    /// Begins a connection attempt with a session identity never used by this client instance.
    ///
    /// The caller sends the returned request exactly once and delivers the response with
    /// [`Self::handle_response`].
    ///
    /// # Errors
    ///
    /// Returns an error unless the client is disconnected or when the session was used before.
    pub fn connect(
        &mut self,
        session: Bytes,
        reference: Reference,
    ) -> Result<Request, LifecycleError> {
        self.require_state(LifecycleState::Disconnected, "connect")?;
        if self.used_sessions.iter().any(|used| used == &session) {
            return Err(LifecycleError::SessionNotFresh);
        }
        self.used_sessions.push(session.clone());
        self.session = Some(session.clone());
        self.state = LifecycleState::Connecting;
        Ok(Request::OpenSession {
            document: self.document.clone(),
            writer: self.writer.clone(),
            session,
            reference,
        })
    }

    /// Begins one submission. This method only constructs a request and never retries it.
    ///
    /// # Errors
    ///
    /// Returns an error unless the client is connected with no pending submission.
    pub fn submit(
        &mut self,
        submission: Bytes,
        local_sequence_number: u64,
        reference: Reference,
        payload: Bytes,
    ) -> Result<Request, LifecycleError> {
        self.require_state(LifecycleState::Connected, "submit")?;
        if self.pending.is_some() {
            return Err(LifecycleError::PendingSubmissionExists);
        }
        let session = self
            .session
            .clone()
            .ok_or(LifecycleError::InvalidTransition {
                state: self.state,
                action: "submit without a session",
            })?;
        self.pending = Some(PendingSubmission {
            session,
            submission,
            local_sequence_number,
            reference,
            payload,
        });
        self.state = LifecycleState::Submitting;
        self.pending_request()
    }

    /// Explicitly replays the stable pending identity to resolve an ambiguous outcome.
    ///
    /// # Errors
    ///
    /// Returns an error unless the client is ambiguous with a pending submission.
    pub fn recover_ambiguous(&mut self) -> Result<Request, LifecycleError> {
        self.require_state(LifecycleState::Ambiguous, "recover an ambiguous submission")?;
        self.state = LifecycleState::Recovering;
        self.pending_request()
    }

    /// Replaces a rejected pending operation for the current fresh session.
    ///
    /// # Errors
    ///
    /// Returns an error unless the client is connected with pending work, or when the caller
    /// reuses the prior submission identity.
    pub fn regenerate_pending(
        &mut self,
        submission: Bytes,
        reference: Reference,
    ) -> Result<Request, LifecycleError> {
        self.require_state(LifecycleState::Connected, "regenerate a pending submission")?;
        let old = self
            .pending
            .as_ref()
            .ok_or(LifecycleError::NoPendingSubmission)?;
        if old.submission == submission {
            return Err(LifecycleError::SubmissionIdentityNotFresh);
        }
        let session = self
            .session
            .clone()
            .ok_or(LifecycleError::InvalidTransition {
                state: self.state,
                action: "regenerate without a session",
            })?;
        self.pending = Some(PendingSubmission {
            session,
            submission,
            local_sequence_number: 1,
            reference,
            payload: old.payload.clone(),
        });
        self.state = LifecycleState::Submitting;
        self.pending_request()
    }

    /// Applies one FSP4 response to the outstanding lifecycle operation.
    ///
    /// # Errors
    ///
    /// Returns an error when no operation is awaiting a response or the response kind does not
    /// match the active operation.
    pub fn handle_response(
        &mut self,
        response: Response,
    ) -> Result<LifecycleEvent, LifecycleError> {
        match self.state {
            LifecycleState::Connecting => self.handle_connect_response(&response),
            LifecycleState::Submitting => self.handle_submit_response(response, false),
            LifecycleState::Recovering => self.handle_submit_response(response, true),
            state => Err(LifecycleError::UnexpectedResponse(state)),
        }
    }

    /// Records transport loss. An in-flight submission always becomes ambiguous.
    pub fn disconnected(&mut self) {
        self.state = match self.state {
            LifecycleState::Submitting | LifecycleState::Recovering => LifecycleState::Ambiguous,
            LifecycleState::Connecting | LifecycleState::Connected => LifecycleState::Disconnected,
            state => state,
        };
    }

    /// Cancels the active operation without issuing a transport request.
    pub fn cancel(&mut self) {
        self.disconnected();
    }

    /// Explicitly abandons the pending operation and returns it to the caller.
    ///
    /// # Errors
    ///
    /// Returns an error while an operation is in flight or when no submission is pending.
    pub fn abandon_pending(&mut self) -> Result<PendingSubmission, LifecycleError> {
        match self.state {
            LifecycleState::Disconnected
            | LifecycleState::Connected
            | LifecycleState::Ambiguous => {}
            state => {
                return Err(LifecycleError::InvalidTransition {
                    state,
                    action: "abandon a pending submission",
                });
            }
        }
        let pending = self
            .pending
            .take()
            .ok_or(LifecycleError::NoPendingSubmission)?;
        if self.state == LifecycleState::Ambiguous {
            self.state = LifecycleState::Disconnected;
        }
        Ok(pending)
    }

    /// Permanently closes the lifecycle and returns any unresolved operation.
    pub fn shutdown(&mut self) -> Option<PendingSubmission> {
        self.state = LifecycleState::Closed;
        self.session = None;
        self.pending.take()
    }

    fn handle_connect_response(
        &mut self,
        response: &Response,
    ) -> Result<LifecycleEvent, LifecycleError> {
        match response {
            Response::Acknowledged(Acknowledgement::SessionOpened) => {
                self.state = LifecycleState::Connected;
                Ok(LifecycleEvent::Connected)
            }
            Response::Error(code) => {
                self.state = LifecycleState::Disconnected;
                Ok(LifecycleEvent::SessionRejected(*code))
            }
            _ => Err(LifecycleError::UnexpectedResponse(self.state)),
        }
    }

    fn handle_submit_response(
        &mut self,
        response: Response,
        recovering: bool,
    ) -> Result<LifecycleEvent, LifecycleError> {
        match response {
            Response::Submitted {
                disposition,
                position,
                sequence_number,
                minimum_reference,
            } => {
                self.pending = None;
                self.state = LifecycleState::Connected;
                Ok(LifecycleEvent::SubmissionAcknowledged(
                    SubmissionAcknowledgement {
                        disposition,
                        position,
                        sequence_number,
                        minimum_reference,
                    },
                ))
            }
            Response::Error(code) if recovering || uncertain_error(code) => {
                self.state = LifecycleState::Ambiguous;
                Ok(LifecycleEvent::SubmissionUncertain(code))
            }
            Response::Error(code) => {
                self.state = LifecycleState::Disconnected;
                Ok(LifecycleEvent::SubmissionRejected(code))
            }
            _ => Err(LifecycleError::UnexpectedResponse(self.state)),
        }
    }

    fn pending_request(&self) -> Result<Request, LifecycleError> {
        let pending = self
            .pending
            .as_ref()
            .ok_or(LifecycleError::NoPendingSubmission)?;
        Ok(Request::Submit(Submission {
            document: self.document.clone(),
            writer: self.writer.clone(),
            session: pending.session.clone(),
            submission: pending.submission.clone(),
            local_sequence_number: pending.local_sequence_number,
            reference: pending.reference.clone(),
            payload: pending.payload.clone(),
        }))
    }

    fn require_state(
        &self,
        required: LifecycleState,
        action: &'static str,
    ) -> Result<(), LifecycleError> {
        if self.state == required {
            Ok(())
        } else {
            Err(LifecycleError::InvalidTransition {
                state: self.state,
                action,
            })
        }
    }
}

fn uncertain_error(code: ErrorCode) -> bool {
    matches!(
        code,
        ErrorCode::Ambiguous
            | ErrorCode::Unavailable
            | ErrorCode::FenceLost
            | ErrorCode::RecoveryRequired
    )
}

#[derive(Debug, Error)]
pub enum CounterError<E> {
    #[error("stream operation failed: {0}")]
    Stream(E),
    #[error("counter record must contain exactly eight bytes")]
    InvalidRecord,
}

pub struct CounterClient<'a, S> {
    stream: &'a S,
}

impl<'a, S> CounterClient<'a, S>
where
    S: AppendStream
        + SnapshotStore<Position = <S as AppendStream>::Position, Error = <S as AppendStream>::Error>,
{
    #[must_use]
    pub fn new(stream: &'a S) -> Self {
        Self { stream }
    }

    /// Appends one counter delta and returns its committed position.
    ///
    /// # Errors
    ///
    /// Returns the implementation error when the append does not succeed.
    pub async fn append_delta(
        &self,
        delta: i64,
    ) -> Result<<S as AppendStream>::Position, CounterError<<S as AppendStream>::Error>> {
        self.stream
            .append(Bytes::copy_from_slice(&delta.to_be_bytes()))
            .await
            .map(|receipt| receipt.position)
            .map_err(CounterError::Stream)
    }

    /// Recovers the counter from the latest snapshot and subsequent records.
    ///
    /// # Errors
    ///
    /// Returns an implementation error or `InvalidRecord` for malformed counter bytes.
    pub async fn recover(
        &self,
    ) -> Result<
        (i64, Option<<S as AppendStream>::Position>),
        CounterError<<S as AppendStream>::Error>,
    > {
        let latest = self.stream.latest().await.map_err(CounterError::Stream)?;
        let (mut value, after) = decode_snapshot(latest.as_ref())?;
        let records = self
            .stream
            .read(after.as_ref())
            .await
            .map_err(CounterError::Stream)?
            .try_collect::<Vec<_>>()
            .await
            .map_err(CounterError::Stream)?;
        let mut head = after;
        for record in records {
            value += decode_i64(&record.payload)?;
            head = Some(record.position);
        }
        Ok((value, head))
    }

    /// Conditionally publishes the current counter state.
    ///
    /// # Errors
    ///
    /// Returns the implementation error when loading or publishing the snapshot fails.
    pub async fn publish_snapshot(
        &self,
        value: i64,
        includes_through: Option<<S as AppendStream>::Position>,
    ) -> Result<(), CounterError<<S as AppendStream>::Error>> {
        let parent = self.stream.latest().await.map_err(CounterError::Stream)?;
        let position = includes_through.map_or(SnapshotPosition::Initial, SnapshotPosition::At);
        self.stream
            .publish(
                Snapshot {
                    includes_through: position,
                    payload: Bytes::copy_from_slice(&value.to_be_bytes()),
                },
                parent.as_ref().map(|value| &value.id),
            )
            .await
            .map_err(CounterError::Stream)?;
        Ok(())
    }
}

type RecoveryState<P> = (i64, Option<P>);

fn decode_snapshot<P: Clone, E>(
    snapshot: Option<&PublishedSnapshot<P>>,
) -> Result<RecoveryState<P>, CounterError<E>> {
    let Some(snapshot) = snapshot else {
        return Ok((0, None));
    };
    let value = decode_i64(&snapshot.snapshot.payload)?;
    let position = match &snapshot.snapshot.includes_through {
        SnapshotPosition::Initial => None,
        SnapshotPosition::At(position) => Some(position.clone()),
    };
    Ok((value, position))
}

fn decode_i64<E>(value: &Bytes) -> Result<i64, CounterError<E>> {
    let encoded: [u8; 8] = value
        .as_ref()
        .try_into()
        .map_err(|_| CounterError::InvalidRecord)?;
    Ok(i64::from_be_bytes(encoded))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bytes(value: &'static [u8]) -> Bytes {
        Bytes::from_static(value)
    }

    fn connected_client() -> NativeClient {
        let mut client = NativeClient::new(bytes(b"document"), bytes(b"writer"));
        client
            .connect(bytes(b"session-1"), Reference::Initial)
            .unwrap();
        assert_eq!(
            client
                .handle_response(Response::Acknowledged(Acknowledgement::SessionOpened))
                .unwrap(),
            LifecycleEvent::Connected
        );
        client
    }

    fn submit(client: &mut NativeClient) -> Request {
        client
            .submit(
                bytes(b"submission-1"),
                1,
                Reference::Initial,
                bytes(b"operation"),
            )
            .unwrap()
    }

    fn submitted(disposition: SubmissionDisposition) -> Response {
        Response::Submitted {
            disposition,
            position: bytes(b"position-1"),
            sequence_number: 7,
            minimum_reference: Reference::Initial,
        }
    }

    #[test]
    fn clean_disconnect_reconnect_uses_fresh_session() {
        let mut client = connected_client();
        client.disconnected();
        assert_eq!(client.state(), LifecycleState::Disconnected);
        assert_eq!(
            client.connect(bytes(b"session-1"), Reference::Initial),
            Err(LifecycleError::SessionNotFresh)
        );
        client
            .connect(bytes(b"session-2"), Reference::Initial)
            .unwrap();
        client
            .handle_response(Response::Acknowledged(Acknowledgement::SessionOpened))
            .unwrap();
        assert_eq!(client.state(), LifecycleState::Connected);
    }

    #[test]
    fn disconnect_before_commit_is_ambiguous_until_accepted_replay() {
        let mut client = connected_client();
        let original = submit(&mut client);
        client.disconnected();
        assert_eq!(client.state(), LifecycleState::Ambiguous);
        assert_eq!(client.recover_ambiguous().unwrap(), original);
        let event = client
            .handle_response(submitted(SubmissionDisposition::Accepted))
            .unwrap();
        assert!(matches!(
            event,
            LifecycleEvent::SubmissionAcknowledged(SubmissionAcknowledgement {
                disposition: SubmissionDisposition::Accepted,
                ..
            })
        ));
        assert_eq!(client.state(), LifecycleState::Connected);
        assert!(client.pending().is_none());
    }

    #[test]
    fn disconnect_after_commit_is_resolved_by_duplicate_acknowledgement() {
        let mut client = connected_client();
        let committed_request = submit(&mut client);
        client.disconnected();
        assert_eq!(client.recover_ambiguous().unwrap(), committed_request);
        let event = client
            .handle_response(submitted(SubmissionDisposition::Duplicate))
            .unwrap();
        assert!(matches!(
            event,
            LifecycleEvent::SubmissionAcknowledged(SubmissionAcknowledgement {
                disposition: SubmissionDisposition::Duplicate,
                ..
            })
        ));
        assert!(client.pending().is_none());
    }

    #[test]
    fn stale_submission_requires_fresh_session_and_regenerated_identity() {
        let mut client = connected_client();
        submit(&mut client);
        assert_eq!(
            client
                .handle_response(Response::Error(ErrorCode::StaleReferencePosition))
                .unwrap(),
            LifecycleEvent::SubmissionRejected(ErrorCode::StaleReferencePosition)
        );
        assert_eq!(client.state(), LifecycleState::Disconnected);
        client
            .connect(
                bytes(b"session-2"),
                Reference::At(bytes(b"current-position")),
            )
            .unwrap();
        client
            .handle_response(Response::Acknowledged(Acknowledgement::SessionOpened))
            .unwrap();
        let regenerated = client
            .regenerate_pending(
                bytes(b"submission-2"),
                Reference::At(bytes(b"current-position")),
            )
            .unwrap();
        let Request::Submit(regenerated) = regenerated else {
            panic!("regeneration must produce a submission");
        };
        assert_eq!(regenerated.session, bytes(b"session-2"));
        assert_eq!(regenerated.submission, bytes(b"submission-2"));
        assert_eq!(regenerated.local_sequence_number, 1);
        assert_eq!(regenerated.payload, bytes(b"operation"));
    }

    #[test]
    fn invalid_submission_is_retained_for_caller_decision() {
        let mut client = connected_client();
        submit(&mut client);
        client
            .handle_response(Response::Error(ErrorCode::LocalSequenceGap))
            .unwrap();
        assert_eq!(client.state(), LifecycleState::Disconnected);
        assert_eq!(client.pending().unwrap().submission, bytes(b"submission-1"));
    }

    #[test]
    fn unavailable_response_preserves_ambiguity_without_hidden_retry() {
        let mut client = connected_client();
        let request = submit(&mut client);
        assert_eq!(
            client
                .handle_response(Response::Error(ErrorCode::Unavailable))
                .unwrap(),
            LifecycleEvent::SubmissionUncertain(ErrorCode::Unavailable)
        );
        assert_eq!(client.state(), LifecycleState::Ambiguous);
        assert_eq!(client.recover_ambiguous().unwrap(), request);
    }

    #[test]
    fn recovery_error_remains_ambiguous() {
        let mut client = connected_client();
        submit(&mut client);
        client.disconnected();
        client.recover_ambiguous().unwrap();
        assert_eq!(
            client
                .handle_response(Response::Error(ErrorCode::RecoveryRequired))
                .unwrap(),
            LifecycleEvent::SubmissionUncertain(ErrorCode::RecoveryRequired)
        );
        assert_eq!(client.state(), LifecycleState::Ambiguous);
    }

    #[test]
    fn caller_can_abandon_ambiguous_submission() {
        let mut client = connected_client();
        submit(&mut client);
        client.disconnected();
        let abandoned = client.abandon_pending().unwrap();
        assert_eq!(abandoned.submission, bytes(b"submission-1"));
        assert_eq!(client.state(), LifecycleState::Disconnected);
        assert!(client.pending().is_none());
    }

    #[test]
    fn cancellation_distinguishes_connect_from_submission() {
        let mut connecting = NativeClient::new(bytes(b"document"), bytes(b"writer"));
        connecting
            .connect(bytes(b"session-1"), Reference::Initial)
            .unwrap();
        connecting.cancel();
        assert_eq!(connecting.state(), LifecycleState::Disconnected);

        let mut submitting = connected_client();
        submit(&mut submitting);
        submitting.cancel();
        assert_eq!(submitting.state(), LifecycleState::Ambiguous);
    }

    #[test]
    fn shutdown_closes_and_returns_unresolved_submission() {
        let mut client = connected_client();
        submit(&mut client);
        let unresolved = client.shutdown().unwrap();
        assert_eq!(unresolved.submission, bytes(b"submission-1"));
        assert_eq!(client.state(), LifecycleState::Closed);
        assert!(matches!(
            client.connect(bytes(b"session-2"), Reference::Initial),
            Err(LifecycleError::InvalidTransition { .. })
        ));
    }

    #[test]
    fn non_submission_acknowledgement_never_commits_pending_work() {
        let mut client = connected_client();
        submit(&mut client);
        assert_eq!(
            client.handle_response(Response::Acknowledged(Acknowledgement::SnapshotPublished)),
            Err(LifecycleError::UnexpectedResponse(
                LifecycleState::Submitting
            ))
        );
        assert!(client.pending().is_some());
        assert_eq!(client.state(), LifecycleState::Submitting);
    }

    #[test]
    fn direct_duplicate_acknowledgement_is_success() {
        let mut client = connected_client();
        submit(&mut client);
        let event = client
            .handle_response(submitted(SubmissionDisposition::Duplicate))
            .unwrap();
        assert!(matches!(
            event,
            LifecycleEvent::SubmissionAcknowledged(SubmissionAcknowledgement {
                disposition: SubmissionDisposition::Duplicate,
                ..
            })
        ));
        assert_eq!(client.state(), LifecycleState::Connected);
    }
}
