//! Bounded, host-local timing evidence retained only in native unit tests.

use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

/// Captures the first opening stages without retaining a host, runtime, or storage.
#[derive(Clone, Debug)]
pub(crate) struct OpeningTrace {
    /// Shared monotonic origin for worker and executor observations.
    started: Instant,
    /// Fixed-capacity history; later traffic cannot grow diagnostic storage.
    events: Arc<Mutex<Vec<(Duration, &'static str)>>>,
}

impl Default for OpeningTrace {
    fn default() -> Self {
        Self {
            started: Instant::now(),
            events: Arc::new(Mutex::new(Vec::with_capacity(32))),
        }
    }
}

impl OpeningTrace {
    /// Records a stage when space remains, without emitting successful-run output.
    pub(crate) fn record(&self, stage: &'static str) {
        let mut events = self.events.lock().expect("opening diagnostics lock");
        if events.len() < 32 {
            events.push((self.started.elapsed(), stage));
        }
    }

    /// Copies the retained timings for a failure message.
    pub(crate) fn snapshot(&self) -> Vec<(Duration, &'static str)> {
        self.events
            .lock()
            .expect("opening diagnostics lock")
            .clone()
    }
}

#[test]
fn opening_trace_is_shared_and_bounded() {
    let trace = OpeningTrace::default();
    let worker = trace.clone();
    trace.record("queued");
    worker.record("started");
    for _ in 0..64 {
        worker.record("later");
    }
    let events = trace.snapshot();
    assert_eq!(events.len(), 32);
    assert_eq!(events[0].1, "queued");
    assert_eq!(events[1].1, "started");
    assert!(events.windows(2).all(|pair| pair[0].0 <= pair[1].0));
}
