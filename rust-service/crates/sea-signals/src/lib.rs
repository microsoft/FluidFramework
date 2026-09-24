#![doc = include_str!("../README.md")]

use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};

use async_trait::async_trait;
use bytes::Bytes;
use sea_core::{
    ClassifiedError, ErrorKind, SeaService,
    signals::{
        SeaSignals, SignalDelivery, SignalEvent, SignalMember, SignalMessage, SignalSubmission,
    },
};
use tokio::sync::{Mutex as AsyncMutex, mpsc, watch};

/// Resource limits for one document's live signal room.
#[derive(Clone, Copy, Debug)]
pub struct SignalLimits {
    /// Maximum number of queued events per receiver.
    pub queue_capacity: usize,
    /// Maximum application payload or membership metadata size.
    pub max_payload_bytes: usize,
    /// Maximum simultaneous room members.
    pub max_members: usize,
}

impl Default for SignalLimits {
    fn default() -> Self {
        Self {
            queue_capacity: 256,
            max_payload_bytes: 64 * 1024,
            max_members: 1024,
        }
    }
}

/// Stable failures of a live signal connection.
#[derive(Clone, Debug, Eq, PartialEq, thiserror::Error)]
pub enum SignalError {
    /// Invalid limits, identity, or message size.
    #[error("signal request exceeds limits or has an invalid identity")]
    Invalid,
    /// The connection identity is already in use, or another receive is pending on this connection.
    #[error("signal connection identity is already in use")]
    Conflict,
    /// The connection has ended.
    #[error("signal connection is closed")]
    Closed,
    /// Reliable delivery failed because this receiver stopped consuming.
    #[error("signal receiver queue overflowed")]
    Lagged,
}

impl ClassifiedError for SignalError {
    fn kind(&self) -> ErrorKind {
        match self {
            Self::Invalid => ErrorKind::Rejected,
            Self::Conflict => ErrorKind::Conflict,
            Self::Closed | Self::Lagged => ErrorKind::Unavailable,
        }
    }
}

/// Sender and lifecycle state retained only while a member is connected.
struct Participant {
    /// Registration identity preventing an old handle from closing a replacement.
    registration: Arc<()>,
    /// Public connection descriptor.
    member: SignalMember,
    /// Bounded live event queue.
    sender: mpsc::Sender<SignalEvent>,
    /// Out-of-band terminal state, so overflow cannot hide its own failure.
    terminal: watch::Sender<Option<SignalError>>,
}

/// One independently authorized document's ephemeral routing domain.
pub struct SignalRoom {
    /// Admission and per-receiver resource bounds.
    limits: SignalLimits,
    /// Serializes registration, membership observations, routing, and removal.
    members: Mutex<BTreeMap<Bytes, Participant>>,
}

impl SignalRoom {
    /// Creates a room without accessing document storage.
    ///
    /// # Errors
    /// Rejects zero capacity, payload size, or member count.
    pub fn new(limits: SignalLimits) -> Result<Arc<Self>, SignalError> {
        if limits.queue_capacity == 0 || limits.max_payload_bytes == 0 || limits.max_members == 0 {
            return Err(SignalError::Invalid);
        }
        Ok(Arc::new(Self {
            limits,
            members: Mutex::new(BTreeMap::new()),
        }))
    }

    /// Registers a host-bound identity; the host must authorize document access first.
    /// Identities must contain 1 to 256 bytes; metadata obeys `max_payload_bytes`.
    ///
    /// # Errors
    /// Rejects duplicate identities, invalid sizes, and rooms with `max_members` live identities.
    ///
    /// # Panics
    /// Panics if another thread panicked while holding the room lock.
    pub fn connect(
        self: &Arc<Self>,
        member: SignalMember,
    ) -> Result<Arc<SignalConnection>, SignalError> {
        if member.id.is_empty()
            || member.id.len() > 256
            || member.metadata.len() > self.limits.max_payload_bytes
        {
            return Err(SignalError::Invalid);
        }
        let mut members = self.members.lock().expect("signal room mutex poisoned");
        if members.contains_key(&member.id) {
            return Err(SignalError::Conflict);
        }
        if members.len() >= self.limits.max_members {
            return Err(SignalError::Invalid);
        }
        let member = SignalMember {
            id: retain_bytes(member.id),
            metadata: retain_bytes(member.metadata),
        };
        let (sender, receiver) = mpsc::channel(self.limits.queue_capacity);
        let (terminal, closed) = watch::channel(None);
        let registration = Arc::new(());
        Self::dispatch(
            &mut members,
            &SignalEvent::Joined(member.clone()),
            None,
            false,
        );
        let mut initial: Vec<_> = members.values().map(|entry| entry.member.clone()).collect();
        initial.push(member.clone());
        sender
            .try_send(SignalEvent::Members(initial))
            .map_err(|_| SignalError::Invalid)?;
        members.insert(
            member.id.clone(),
            Participant {
                registration: registration.clone(),
                member: member.clone(),
                sender,
                terminal,
            },
        );
        Ok(Arc::new(SignalConnection {
            room: self.clone(),
            id: member.id,
            registration,
            receiver: AsyncMutex::new(receiver),
            terminal: closed,
        }))
    }

    /// Routes an event and recursively removes slow members without awaiting any recipient.
    fn dispatch(
        members: &mut BTreeMap<Bytes, Participant>,
        event: &SignalEvent,
        target: Option<&Bytes>,
        best_effort: bool,
    ) {
        let mut removed = Vec::new();
        for (id, participant) in members.iter() {
            if target.is_some_and(|target| target != id) {
                continue;
            }
            if participant.sender.try_send(event.clone()).is_err() && !best_effort {
                removed.push(id.clone());
            }
        }
        while let Some(id) = removed.pop() {
            if let Some(participant) = members.remove(&id) {
                participant.terminal.send_replace(Some(SignalError::Lagged));
                for (other_id, other) in members.iter() {
                    if other
                        .sender
                        .try_send(SignalEvent::Left(id.clone()))
                        .is_err()
                    {
                        removed.push(other_id.clone());
                    }
                }
            }
        }
    }

    /// Removes one membership and informs remaining members.
    fn disconnect(&self, id: &Bytes, registration: &Arc<()>) {
        let mut members = self.members.lock().expect("signal room mutex poisoned");
        if !members
            .get(id)
            .is_some_and(|entry| Arc::ptr_eq(&entry.registration, registration))
        {
            return;
        }
        if let Some(participant) = members.remove(id) {
            participant.terminal.send_replace(Some(SignalError::Closed));
            Self::dispatch(&mut members, &SignalEvent::Left(id.clone()), None, false);
        }
    }
}

/// Retains only the admitted bytes, not an arbitrarily large caller-owned backing allocation.
fn retain_bytes(bytes: Bytes) -> Bytes {
    let retained = Bytes::from(bytes.as_ref().to_vec().into_boxed_slice());
    drop(bytes);
    retained
}

/// A live connection whose final owner releases its room membership.
pub struct SignalConnection {
    /// Registration lease distinct from a reusable public identity.
    registration: Arc<()>,
    /// Owning routing domain.
    room: Arc<SignalRoom>,
    /// Host-bound sender identity.
    id: Bytes,
    /// Single-consumer queue; pending receives are cancellation safe.
    receiver: AsyncMutex<mpsc::Receiver<SignalEvent>>,
    /// Terminal state independent of queue capacity.
    terminal: watch::Receiver<Option<SignalError>>,
}

impl Drop for SignalConnection {
    fn drop(&mut self) {
        self.room.disconnect(&self.id, &self.registration);
    }
}

impl SeaService for SignalConnection {
    type Error = SignalError;
}

/// Document-bound factory retaining one shared room without any author authority.
pub struct LocalSignalService(Arc<SignalRoom>);

impl LocalSignalService {
    /// Wraps an already authorized room for neutral factory consumers.
    #[must_use]
    pub const fn new(room: Arc<SignalRoom>) -> Self {
        Self(room)
    }
}

impl SeaService for LocalSignalService {
    type Error = SignalError;
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl sea_core::signals::SeaSignalService for LocalSignalService {
    type Connection = SignalConnection;
    async fn open_signals(
        &self,
        member: SignalMember,
    ) -> Result<Arc<SignalConnection>, SignalError> {
        self.0.connect(member)
    }
}

#[cfg_attr(not(target_arch = "wasm32"), async_trait)]
#[cfg_attr(target_arch = "wasm32", async_trait(?Send))]
impl SeaSignals for SignalConnection {
    async fn send_signal(&self, submission: SignalSubmission) -> Result<(), SignalError> {
        if submission.payload.len() > self.room.limits.max_payload_bytes
            || submission
                .target
                .as_ref()
                .is_some_and(|target| target.is_empty() || target.len() > 256)
        {
            return Err(SignalError::Invalid);
        }
        let mut members = self
            .room
            .members
            .lock()
            .expect("signal room mutex poisoned");
        if self.terminal.borrow().is_some() || !members.contains_key(&self.id) {
            return Err(SignalError::Closed);
        }
        let submission = SignalSubmission {
            target: submission.target.map(retain_bytes),
            payload: retain_bytes(submission.payload),
            delivery: submission.delivery,
        };
        let target = submission.target.clone();
        let best_effort = submission.delivery == SignalDelivery::BestEffort;
        SignalRoom::dispatch(
            &mut members,
            &SignalEvent::Message(SignalMessage {
                sender: self.id.clone(),
                submission,
            }),
            target.as_ref(),
            best_effort,
        );
        Ok(())
    }

    async fn next_signal(&self) -> Result<Option<SignalEvent>, SignalError> {
        let mut terminal = self.terminal.clone();
        let mut receiver = self
            .receiver
            .try_lock()
            .map_err(|_| SignalError::Conflict)?;
        loop {
            match terminal.borrow().clone() {
                Some(SignalError::Closed) => return Ok(None),
                Some(error) => return Err(error),
                None => {}
            }
            tokio::select! {
                biased;
                _ = terminal.changed() => {},
                event = receiver.recv() => return Ok(event),
            }
        }
    }

    async fn close_signals(&self) -> Result<(), SignalError> {
        self.room.disconnect(&self.id, &self.registration);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Returns a small visible value backed by a much larger caller-owned allocation.
    fn oversized_backing_slice(value: &[u8]) -> (Bytes, std::sync::Weak<[u8]>) {
        let mut allocation = vec![0; 4096];
        allocation[..value.len()].copy_from_slice(value);
        let owner = Arc::<[u8]>::from(allocation);
        let weak = Arc::downgrade(&owner);
        (Bytes::from_owner(owner).slice(..value.len()), weak)
    }

    #[tokio::test]
    async fn retained_membership_does_not_pin_oversized_caller_allocations() {
        let room = SignalRoom::new(SignalLimits::default()).unwrap();
        let (id, id_owner) = oversized_backing_slice(b"member");
        let (metadata, metadata_owner) = oversized_backing_slice(b"public");
        let connection = room.connect(SignalMember { id, metadata }).unwrap();
        assert!(id_owner.upgrade().is_none(), "retained identity backing");
        assert!(
            metadata_owner.upgrade().is_none(),
            "retained metadata backing"
        );
        assert_eq!(
            connection.next_signal().await.unwrap(),
            Some(SignalEvent::Members(vec![SignalMember {
                id: Bytes::from_static(b"member"),
                metadata: Bytes::from_static(b"public"),
            }]))
        );
    }

    #[tokio::test]
    async fn queued_messages_do_not_pin_oversized_caller_allocations() {
        let room = SignalRoom::new(SignalLimits::default()).unwrap();
        let connection = connect(&room, "member").await;
        let (target, target_owner) = oversized_backing_slice(b"member");
        let (payload, payload_owner) = oversized_backing_slice(b"hello");
        connection
            .send_signal(SignalSubmission {
                target: Some(target),
                payload,
                delivery: SignalDelivery::Reliable,
            })
            .await
            .unwrap();
        assert!(target_owner.upgrade().is_none(), "queued target backing");
        assert!(payload_owner.upgrade().is_none(), "queued payload backing");
        assert_eq!(
            connection.next_signal().await.unwrap(),
            Some(SignalEvent::Message(SignalMessage {
                sender: Bytes::from_static(b"member"),
                submission: message(Some("member"), SignalDelivery::Reliable),
            }))
        );
    }

    #[tokio::test]
    async fn initial_snapshot_and_live_join_preserve_public_descriptors() {
        let room = SignalRoom::new(SignalLimits::default()).unwrap();
        let first_member = SignalMember {
            id: Bytes::from_static(b"first"),
            metadata: Bytes::from_static(b"first metadata"),
        };
        let second_member = SignalMember {
            id: Bytes::from_static(b"second"),
            metadata: Bytes::from_static(b"second metadata"),
        };
        let first = room.connect(first_member.clone()).unwrap();
        assert_eq!(
            first.next_signal().await.unwrap(),
            Some(SignalEvent::Members(vec![first_member.clone()]))
        );
        let second = room.connect(second_member.clone()).unwrap();
        let Some(SignalEvent::Members(members)) = second.next_signal().await.unwrap() else {
            panic!("expected initial membership")
        };
        assert_eq!(members.len(), 2);
        assert!(members.contains(&first_member));
        assert!(members.contains(&second_member));
        assert_eq!(
            first.next_signal().await.unwrap(),
            Some(SignalEvent::Joined(second_member))
        );
    }

    #[tokio::test]
    async fn admission_rejects_invalid_limits_identity_metadata_and_capacity() {
        for limits in [
            SignalLimits {
                queue_capacity: 0,
                ..SignalLimits::default()
            },
            SignalLimits {
                max_payload_bytes: 0,
                ..SignalLimits::default()
            },
            SignalLimits {
                max_members: 0,
                ..SignalLimits::default()
            },
        ] {
            assert!(matches!(SignalRoom::new(limits), Err(SignalError::Invalid)));
        }
        let room = SignalRoom::new(SignalLimits {
            max_payload_bytes: 5,
            max_members: 1,
            ..SignalLimits::default()
        })
        .unwrap();
        for (id, metadata) in [
            (Bytes::new(), Bytes::new()),
            (Bytes::from(vec![0; 257]), Bytes::new()),
            (
                Bytes::from_static(b"member"),
                Bytes::from_static(b"too big"),
            ),
        ] {
            assert!(matches!(
                room.connect(SignalMember { id, metadata }),
                Err(SignalError::Invalid)
            ));
            assert!(room.members.lock().unwrap().is_empty());
        }
        let first = connect(&room, "first").await;
        for (id, expected) in [
            ("first", SignalError::Conflict),
            ("second", SignalError::Invalid),
        ] {
            assert!(matches!(
                room.connect(SignalMember { id: Bytes::from(id), metadata: Bytes::new() }),
                Err(error) if error == expected
            ));
        }
        for target in [Bytes::new(), Bytes::from(vec![0; 257])] {
            assert_eq!(
                first
                    .send_signal(SignalSubmission {
                        target: Some(target),
                        ..message(None, SignalDelivery::Reliable)
                    })
                    .await,
                Err(SignalError::Invalid)
            );
            assert_eq!(
                first.receiver.lock().await.try_recv(),
                Err(mpsc::error::TryRecvError::Empty)
            );
        }
        first.close_signals().await.unwrap();
        let replacement = connect(&room, "first").await;
        assert_eq!(
            first
                .send_signal(message(None, SignalDelivery::Reliable))
                .await,
            Err(SignalError::Closed)
        );
        replacement
            .send_signal(message(None, SignalDelivery::Reliable))
            .await
            .unwrap();
        assert!(matches!(
            replacement.next_signal().await.unwrap(),
            Some(SignalEvent::Message(_))
        ));
    }

    #[tokio::test]
    async fn reliable_departure_overflow_evicts_each_affected_member() {
        let room = SignalRoom::new(SignalLimits {
            queue_capacity: 2,
            ..SignalLimits::default()
        })
        .unwrap();
        let sender = connect(&room, "sender").await;
        let slow = connect(&room, "slow").await;
        let peer = connect(&room, "peer").await;
        sender.next_signal().await.unwrap();
        sender.next_signal().await.unwrap();
        slow.next_signal().await.unwrap();
        for target in ["slow", "peer"] {
            for _ in 0..2 {
                sender
                    .send_signal(message(Some(target), SignalDelivery::BestEffort))
                    .await
                    .unwrap();
            }
        }
        sender
            .send_signal(message(Some("slow"), SignalDelivery::Reliable))
            .await
            .unwrap();
        assert_eq!(slow.next_signal().await, Err(SignalError::Lagged));
        assert_eq!(peer.next_signal().await, Err(SignalError::Lagged));
        for id in ["slow", "peer"] {
            assert_eq!(
                sender.next_signal().await.unwrap(),
                Some(SignalEvent::Left(Bytes::from(id)))
            );
        }
        assert_eq!(room.members.lock().unwrap().len(), 1);
        sender
            .send_signal(message(None, SignalDelivery::Reliable))
            .await
            .unwrap();
        assert!(matches!(
            sender.next_signal().await.unwrap(),
            Some(SignalEvent::Message(_))
        ));
    }

    #[tokio::test]
    async fn cancelled_receive_preserves_messages_and_close_wakes_receive() {
        let room = SignalRoom::new(SignalLimits::default()).unwrap();
        let connection = connect(&room, "member").await;
        let mut pending = Box::pin(connection.next_signal());
        tokio::select! { biased; result = &mut pending => panic!("unexpected {result:?}"), () = std::future::ready(()) => {} }
        assert_eq!(connection.next_signal().await, Err(SignalError::Conflict));
        drop(pending);
        connection
            .send_signal(SignalSubmission {
                target: None,
                payload: Bytes::from_static(b"retained"),
                delivery: SignalDelivery::Reliable,
            })
            .await
            .unwrap();
        assert!(
            matches!(connection.next_signal().await.unwrap(), Some(SignalEvent::Message(message)) if message.submission.payload == "retained")
        );
        let (received, closed) = tokio::join!(connection.next_signal(), connection.close_signals());
        assert_eq!(received, Ok(None));
        assert_eq!(closed, Ok(()));
    }

    /// Opens and consumes a connection's initial membership snapshot.
    async fn connect(room: &Arc<SignalRoom>, id: &'static str) -> Arc<SignalConnection> {
        let connection = room
            .connect(SignalMember {
                id: Bytes::from_static(id.as_bytes()),
                metadata: Bytes::new(),
            })
            .unwrap();
        assert!(matches!(
            connection.next_signal().await.unwrap(),
            Some(SignalEvent::Members(_))
        ));
        connection
    }

    /// Builds a message with explicit delivery and optional target.
    fn message(target: Option<&'static str>, delivery: SignalDelivery) -> SignalSubmission {
        SignalSubmission {
            target: target.map(Bytes::from),
            payload: Bytes::from_static(b"hello"),
            delivery,
        }
    }

    #[tokio::test]
    async fn broadcast_target_membership_and_no_replay() {
        let room = SignalRoom::new(SignalLimits::default()).unwrap();
        let first = connect(&room, "first").await;
        first
            .send_signal(message(None, SignalDelivery::Reliable))
            .await
            .unwrap();
        assert!(matches!(
            first.next_signal().await.unwrap(),
            Some(SignalEvent::Message(_))
        ));
        let second = connect(&room, "second").await;
        assert!(matches!(
            first.next_signal().await.unwrap(),
            Some(SignalEvent::Joined(_))
        ));
        first
            .send_signal(message(Some("second"), SignalDelivery::Reliable))
            .await
            .unwrap();
        assert!(
            matches!(second.next_signal().await.unwrap(), Some(SignalEvent::Message(SignalMessage { sender, .. })) if sender == "first")
        );
        assert!(first.receiver.lock().await.try_recv().is_err());
        assert!(second.receiver.lock().await.try_recv().is_err());
        second.close_signals().await.unwrap();
        assert_eq!(
            first.next_signal().await.unwrap(),
            Some(SignalEvent::Left(Bytes::from_static(b"second")))
        );
        assert_eq!(second.next_signal().await.unwrap(), None);
    }

    #[tokio::test]
    async fn document_scoped_routing_preserves_recipients_and_envelopes() {
        let room = SignalRoom::new(SignalLimits::default()).unwrap();
        let other_room = SignalRoom::new(SignalLimits::default()).unwrap();
        let sender = connect(&room, "sender").await;
        let recipient = connect(&room, "recipient").await;
        let other_sender = connect(&other_room, "sender").await;
        let other_recipient = connect(&other_room, "recipient").await;
        for connection in [&sender, &other_sender] {
            assert_eq!(
                connection.next_signal().await.unwrap(),
                Some(SignalEvent::Joined(SignalMember {
                    id: Bytes::from_static(b"recipient"),
                    metadata: Bytes::new(),
                }))
            );
        }

        for delivery in [SignalDelivery::Reliable, SignalDelivery::BestEffort] {
            for target in [None, Some("recipient"), Some("missing")] {
                let submission = message(target, delivery);
                let expected = SignalEvent::Message(SignalMessage {
                    sender: Bytes::from_static(b"sender"),
                    submission: submission.clone(),
                });
                sender.send_signal(submission).await.unwrap();
                for (connection, receives_message) in [
                    (&sender, target.is_none()),
                    (&recipient, target != Some("missing")),
                    (&other_sender, false),
                    (&other_recipient, false),
                ] {
                    let mut receiver = connection.receiver.lock().await;
                    if receives_message {
                        assert_eq!(receiver.try_recv(), Ok(expected.clone()));
                    }
                    assert_eq!(receiver.try_recv(), Err(mpsc::error::TryRecvError::Empty));
                }
            }
        }
    }

    #[tokio::test]
    async fn best_effort_drops_but_reliable_overflow_fails_only_slow_receiver() {
        let room = SignalRoom::new(SignalLimits {
            queue_capacity: 1,
            ..SignalLimits::default()
        })
        .unwrap();
        let sender = connect(&room, "sender").await;
        let slow = connect(&room, "slow").await;
        sender.next_signal().await.unwrap();
        for _ in 0..3 {
            sender
                .send_signal(message(Some("slow"), SignalDelivery::BestEffort))
                .await
                .unwrap();
        }
        assert!(matches!(
            slow.next_signal().await.unwrap(),
            Some(SignalEvent::Message(_))
        ));
        for _ in 0..2 {
            sender
                .send_signal(message(Some("slow"), SignalDelivery::Reliable))
                .await
                .unwrap();
        }
        assert_eq!(slow.next_signal().await, Err(SignalError::Lagged));
        assert_eq!(
            sender.next_signal().await.unwrap(),
            Some(SignalEvent::Left(Bytes::from_static(b"slow")))
        );
        sender
            .send_signal(message(None, SignalDelivery::Reliable))
            .await
            .unwrap();
        assert!(matches!(
            sender.next_signal().await.unwrap(),
            Some(SignalEvent::Message(_))
        ));
    }

    #[tokio::test]
    async fn old_handle_cannot_close_replacement_and_admission_snapshot_is_current() {
        let room = SignalRoom::new(SignalLimits {
            queue_capacity: 1,
            ..SignalLimits::default()
        })
        .unwrap();
        let old = connect(&room, "same").await;
        old.close_signals().await.unwrap();
        let replacement = connect(&room, "same").await;
        drop(old);
        replacement
            .send_signal(message(None, SignalDelivery::Reliable))
            .await
            .unwrap();
        let newcomer = room
            .connect(SignalMember {
                id: Bytes::from_static(b"new"),
                metadata: Bytes::new(),
            })
            .unwrap();
        assert_eq!(replacement.next_signal().await, Err(SignalError::Lagged));
        assert!(
            matches!(newcomer.next_signal().await.unwrap(), Some(SignalEvent::Members(members)) if members.len() == 1 && members[0].id == "new")
        );
    }

    #[tokio::test]
    async fn payload_limits_missing_target_and_drop() {
        let room = SignalRoom::new(SignalLimits {
            max_payload_bytes: 5,
            ..SignalLimits::default()
        })
        .unwrap();
        let first = connect(&room, "first").await;
        let second = connect(&room, "second").await;
        first.next_signal().await.unwrap();
        first
            .send_signal(message(Some("missing"), SignalDelivery::Reliable))
            .await
            .unwrap();
        let mut oversized = message(None, SignalDelivery::Reliable);
        oversized.payload = Bytes::from_static(b"too big");
        assert_eq!(
            first.send_signal(oversized).await,
            Err(SignalError::Invalid)
        );
        drop(second);
        assert_eq!(
            first.next_signal().await.unwrap(),
            Some(SignalEvent::Left(Bytes::from_static(b"second")))
        );
    }
}
