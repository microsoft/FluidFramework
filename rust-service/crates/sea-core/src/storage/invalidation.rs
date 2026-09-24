//! Optional terminal opening notifications, independent of archive polling.

use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};

/// A terminal observer must only update its own state, never reenter storage or block on I/O.
pub type InvalidationCallback<E> = Arc<dyn Fn(Arc<E>) + Send + Sync>;

/// Keeps a terminal observer registered; dropping it unregisters synchronously.
pub struct InvalidationRegistration(Option<Box<dyn FnOnce() + Send + Sync>>);

impl InvalidationRegistration {
    /// Declares that this opening remains valid as long as its independent owners remain alive.
    #[must_use]
    pub fn never_invalidates() -> Self {
        Self(None)
    }
}

impl Drop for InvalidationRegistration {
    fn drop(&mut self) {
        if let Some(remove) = self.0.take() {
            remove();
        }
    }
}

/// Sticky terminal state shared by one storage opening.
///
/// Registration races safely with invalidation. Callbacks run synchronously, outside this
/// source's lock, and must not call back into storage. A concurrently removed observer may
/// receive a final callback. No executor task or archive poll is required.
pub struct InvalidationSource<E>(Arc<Mutex<State<E>>>);

/// Callback identities and the first terminal cause.
struct State<E> {
    /// The first invalidation wins.
    terminal: Option<Arc<E>>,
    /// Never reused while the source exists.
    next: u64,
    /// Observers removed on registration drop or invalidation.
    callbacks: BTreeMap<u64, InvalidationCallback<E>>,
}

impl<E> Default for InvalidationSource<E> {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(State {
            terminal: None,
            next: 0,
            callbacks: BTreeMap::new(),
        })))
    }
}

impl<E> std::fmt::Debug for InvalidationSource<E> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("InvalidationSource")
            .finish_non_exhaustive()
    }
}

impl<E: Send + Sync + 'static> InvalidationSource<E> {
    /// Registers an observer, immediately notifying it if this opening is already invalid.
    ///
    /// # Panics
    /// Panics if the source lock is poisoned, registration identities are exhausted,
    /// or an immediately notified observer panics.
    pub fn register(&self, callback: InvalidationCallback<E>) -> InvalidationRegistration {
        let mut state = self.0.lock().expect("invalidation lock");
        if let Some(error) = state.terminal.clone() {
            drop(state);
            callback(error);
            return InvalidationRegistration(None);
        }

        let id = state.next;
        state.next = id.checked_add(1).expect("invalidation identity exhausted");
        state.callbacks.insert(id, callback);
        let weak = Arc::downgrade(&self.0);
        InvalidationRegistration(Some(Box::new(move || {
            if let Some(source) = weak.upgrade() {
                source
                    .lock()
                    .expect("invalidation lock")
                    .callbacks
                    .remove(&id);
            }
        })))
    }

    /// Publishes the first terminal cause and releases all registrations before returning.
    ///
    /// # Panics
    /// Panics if the source lock is poisoned or an observer panics.
    pub fn invalidate(&self, error: E) {
        let callbacks = {
            let mut state = self.0.lock().expect("invalidation lock");
            if state.terminal.is_some() {
                return;
            }
            let error = Arc::new(error);
            state.terminal = Some(error.clone());
            (error, std::mem::take(&mut state.callbacks))
        };
        for callback in callbacks.1.into_values() {
            callback(callbacks.0.clone());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn invalidation_is_sticky_synchronous_and_unregisters() {
        let source = InvalidationSource::<std::io::Error>::default();
        let count = Arc::new(AtomicUsize::new(0));
        let observed = count.clone();
        let callback: InvalidationCallback<std::io::Error> = Arc::new(move |error| {
            assert_eq!(error.kind(), std::io::ErrorKind::BrokenPipe);
            observed.fetch_add(1, Ordering::SeqCst);
        });
        let removed = source.register(callback.clone());
        drop(removed);
        let retained = source.register(callback.clone());
        source.invalidate(std::io::Error::from(std::io::ErrorKind::BrokenPipe));
        assert_eq!(count.load(Ordering::SeqCst), 1);
        let late = source.register(callback);
        assert_eq!(count.load(Ordering::SeqCst), 2);
        source.invalidate(std::io::Error::from(std::io::ErrorKind::TimedOut));
        assert_eq!(count.load(Ordering::SeqCst), 2);
        drop((retained, late));
    }

    #[test]
    fn racing_registration_and_invalidation_never_miss_the_terminal_cause() {
        for _ in 0..32 {
            let source = Arc::new(InvalidationSource::<std::io::Error>::default());
            let count = Arc::new(AtomicUsize::new(0));
            let barrier = Arc::new(std::sync::Barrier::new(2));
            let registering = source.clone();
            let ready = barrier.clone();
            let observed = count.clone();
            let worker = std::thread::spawn(move || {
                ready.wait();
                registering.register(Arc::new(move |_| {
                    observed.fetch_add(1, Ordering::SeqCst);
                }))
            });
            barrier.wait();
            source.invalidate(std::io::Error::from(std::io::ErrorKind::BrokenPipe));
            let registration = worker.join().unwrap();
            assert_eq!(count.load(Ordering::SeqCst), 1);
            drop(registration);
        }
    }

    #[test]
    fn callbacks_run_outside_the_source_lock() {
        let source = InvalidationSource::<std::io::Error>::default();
        let state = Arc::downgrade(&source.0);
        let callback: InvalidationCallback<std::io::Error> = Arc::new(move |_| {
            let state = state.upgrade().unwrap();
            assert!(
                state.try_lock().is_ok(),
                "callback must not hold source lock"
            );
        });
        let early = source.register(callback.clone());
        source.invalidate(std::io::Error::from(std::io::ErrorKind::BrokenPipe));
        let late = source.register(callback);
        drop((early, late));
    }
}
