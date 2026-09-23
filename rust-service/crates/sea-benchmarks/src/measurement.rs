//! Host-epoch timestamps anchored once to a monotonic clock for paired CPU measurements.

use std::time::{Instant, SystemTime, UNIX_EPOCH};

/// One clock anchor shared by all delivery tasks in a generator.
#[derive(Clone, Copy)]
pub struct MeasurementClock {
    /// Monotonic midpoint of the wall-clock read.
    instant: Instant,
    /// Wall clock at the anchor.
    epoch_micros: u64,
    /// Full bracket width around the anchor.
    uncertainty_micros: u64,
}

impl Default for MeasurementClock {
    fn default() -> Self {
        Self::new()
    }
}

impl MeasurementClock {
    /// Brackets the wall-clock read to bound anchor uncertainty.
    ///
    /// # Panics
    ///
    /// Panics if the host clock predates the epoch or a timestamp cannot fit in `u64`.
    #[must_use]
    pub fn new() -> Self {
        let before = Instant::now();
        let epoch_micros = epoch_micros();
        let after = Instant::now();
        Self {
            instant: before + after.duration_since(before) / 2,
            epoch_micros,
            uncertainty_micros: u64::try_from(after.duration_since(before).as_micros())
                .expect("clock bracket fits u64"),
        }
    }

    /// Converts a delivery instant into the shared host epoch.
    ///
    /// # Panics
    ///
    /// Panics if the elapsed microseconds cannot fit in `u64`.
    #[must_use]
    pub fn at(self, instant: Instant) -> u64 {
        self.epoch_micros
            + u64::try_from(instant.duration_since(self.instant).as_micros())
                .expect("measurement duration fits u64")
    }

    /// Reports anchor precision and the final wall/monotonic discrepancy.
    #[must_use]
    pub fn report(self) -> serde_json::Value {
        let before = Instant::now();
        let wall = epoch_micros();
        let after = Instant::now();
        serde_json::json!({
            "anchorUncertaintyMicros": self.uncertainty_micros,
            "endUncertaintyMicros": after.duration_since(before).as_micros(),
            "clockDiscrepancyMicros": wall.abs_diff(self.at(before + after.duration_since(before) / 2)),
        })
    }
}

/// Reads the common Linux host epoch without introducing a floating-point timestamp.
fn epoch_micros() -> u64 {
    u64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("host clock follows epoch")
            .as_micros(),
    )
    .expect("host epoch fits u64")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn monotonic_clock_and_output_shape() {
        let clock = MeasurementClock::new();
        let first = clock.at(Instant::now());
        assert!(clock.at(Instant::now()) >= first);
        let report = clock.report();
        for key in [
            "anchorUncertaintyMicros",
            "endUncertaintyMicros",
            "clockDiscrepancyMicros",
        ] {
            assert!(report[key].is_u64());
        }
    }
}
