//! Platform-independent Sea client connection state.

use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex, Weak},
};

use thiserror::Error;

use crate::protocol::{CorrelationTracker, ProtocolError, StreamRole};

/// Failure from shared client connection or correlation state.
#[derive(Debug, Error)]
pub enum ClientStateError {
    /// The logical client connection is closed.
    #[error("Sea client is closed")]
    Closed,
    /// A stream-scoped correlation invariant failed.
    #[error(transparent)]
    Protocol(#[from] ProtocolError),
    /// Shared state was poisoned by a panic.
    #[error("Sea client state is unavailable")]
    Poisoned,
}

#[derive(Debug)]
struct State {
    closed: bool,
    next_correlation_id: u64,
    correlations: BTreeMap<StreamRole, CorrelationTracker>,
}

/// Shared connection state used by every platform transport binding.
#[derive(Debug)]
pub struct ClientState {
    inner: Mutex<State>,
}

impl Default for ClientState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(State {
                closed: false,
                next_correlation_id: 1,
                correlations: BTreeMap::new(),
            }),
        }
    }
}

impl ClientState {
    /// Begins one stream-scoped request and returns its cancellation-safe guard.
    pub fn begin(
        self: &Arc<Self>,
        role: StreamRole,
    ) -> Result<PendingCorrelation, ClientStateError> {
        let mut state = self.inner.lock().map_err(|_| ClientStateError::Poisoned)?;
        if state.closed {
            return Err(ClientStateError::Closed);
        }
        let correlation_id = state.next_correlation_id;
        state.next_correlation_id = correlation_id.wrapping_add(1).max(1);
        state
            .correlations
            .entry(role)
            .or_default()
            .begin(correlation_id)?;
        Ok(PendingCorrelation {
            client: Arc::downgrade(self),
            role,
            correlation_id,
            active: true,
        })
    }

    /// Marks the connection closed; future requests are rejected.
    pub fn close(&self) -> Result<(), ClientStateError> {
        self.inner
            .lock()
            .map_err(|_| ClientStateError::Poisoned)?
            .closed = true;
        Ok(())
    }

    /// Returns whether the logical connection has been closed.
    pub fn is_closed(&self) -> Result<bool, ClientStateError> {
        Ok(self
            .inner
            .lock()
            .map_err(|_| ClientStateError::Poisoned)?
            .closed)
    }

    fn complete(&self, role: StreamRole, correlation_id: u64) -> Result<(), ClientStateError> {
        self.inner
            .lock()
            .map_err(|_| ClientStateError::Poisoned)?
            .correlations
            .entry(role)
            .or_default()
            .complete(correlation_id)?;
        Ok(())
    }

    fn abandon(&self, role: StreamRole, correlation_id: u64) {
        if let Ok(mut state) = self.inner.lock() {
            let _ = state
                .correlations
                .entry(role)
                .or_default()
                .complete(correlation_id);
        }
    }
}

/// One active request correlation that is abandoned automatically on cancellation.
#[derive(Debug)]
pub struct PendingCorrelation {
    client: Weak<ClientState>,
    role: StreamRole,
    correlation_id: u64,
    active: bool,
}

impl PendingCorrelation {
    /// Returns the assigned nonzero correlation ID.
    #[must_use]
    pub const fn id(&self) -> u64 {
        self.correlation_id
    }

    /// Completes this request after validating the response correlation.
    pub fn complete(mut self, response_id: u64) -> Result<(), ClientStateError> {
        if response_id != self.correlation_id {
            return Err(ProtocolError::UnknownCorrelation(response_id).into());
        }
        if let Some(client) = self.client.upgrade() {
            client.complete(self.role, self.correlation_id)?;
        }
        self.active = false;
        Ok(())
    }
}

impl Drop for PendingCorrelation {
    fn drop(&mut self) {
        if self.active
            && let Some(client) = self.client.upgrade()
        {
            client.abandon(self.role, self.correlation_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::{ClientState, ClientStateError};
    use crate::protocol::{ProtocolError, StreamRole};

    #[test]
    fn correlations_are_scoped_completed_and_abandoned() {
        let state = Arc::new(ClientState::default());
        let first = state.begin(StreamRole::Author).expect("first request");
        let first_id = first.id();
        assert_ne!(first_id, 0);
        first.complete(first_id).expect("matching response");

        let cancelled = state.begin(StreamRole::Content).expect("cancelled request");
        let cancelled_id = cancelled.id();
        drop(cancelled);
        let next = state
            .begin(StreamRole::Content)
            .expect("request after cancellation");
        assert_ne!(next.id(), cancelled_id);
    }

    #[test]
    fn correlation_mismatch_and_closed_state_are_rejected() {
        let state = Arc::new(ClientState::default());
        let pending = state.begin(StreamRole::Event).expect("pending request");
        assert!(matches!(
            pending.complete(99),
            Err(ClientStateError::Protocol(
                ProtocolError::UnknownCorrelation(99)
            ))
        ));
        state.close().expect("close");
        assert!(matches!(
            state.begin(StreamRole::Event),
            Err(ClientStateError::Closed)
        ));
    }
}
