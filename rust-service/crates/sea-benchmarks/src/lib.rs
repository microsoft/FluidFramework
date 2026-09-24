#![doc = include_str!("../README.md")]

use serde::{Deserialize, Serialize};

pub mod measurement;

/// Version of the newline-delimited JSON result schema emitted by the harness.
pub const SCHEMA_VERSION: u32 = 3;
/// Default deterministic fixture seed recorded in benchmark results.
pub const DEFAULT_SEED: u64 = 0x4d59_5df4_d0f3_3173;

/// Payload shape generated for each benchmark record.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum FixtureKind {
    /// A zero-byte payload.
    Empty,
    /// A repeating 64-byte payload suitable for compression.
    SmallCompressible,
    /// A deterministic pseudorandom 64-byte payload.
    SmallIncompressible,
    /// A repeating 65,536-byte payload suitable for compression.
    LargeCompressible,
    /// A deterministic pseudorandom 65,536-byte payload.
    LargeIncompressible,
    /// An eight-byte big-endian record index used as snapshot state.
    Snapshot,
}

/// API boundary whose acknowledged operations are measured.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum MeasurementBoundary {
    /// Trusted archive backend operations through [`sea_core::storage::SeaView`].
    Storage,
    /// Author operations through a sequenced [`sea_core::session::SeaSession`].
    SequencedSession,
}

impl FixtureKind {
    /// Returns the exact number of bytes generated for one payload of this kind.
    #[must_use]
    pub const fn payload_size(self) -> usize {
        match self {
            Self::Empty => 0,
            Self::SmallCompressible | Self::SmallIncompressible => 64,
            Self::LargeCompressible | Self::LargeIncompressible => 65_536,
            Self::Snapshot => 8,
        }
    }

    /// Reports whether this fixture repeats a short pattern.
    #[must_use]
    pub const fn is_compressible(self) -> bool {
        matches!(self, Self::SmallCompressible | Self::LargeCompressible)
    }
}

/// Generates reproducible benchmark payloads from a seed and record index.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FixtureGenerator {
    seed: u64,
}

impl FixtureGenerator {
    /// Creates a fixture generator with the supplied deterministic seed.
    #[must_use]
    pub const fn new(seed: u64) -> Self {
        Self { seed }
    }

    /// Generates the payload for `kind` at `record_index`.
    #[must_use]
    pub fn payload(&self, kind: FixtureKind, record_index: u64) -> Vec<u8> {
        let size = kind.payload_size();
        if kind == FixtureKind::Snapshot {
            return record_index.to_be_bytes().to_vec();
        }
        if kind.is_compressible() {
            let pattern = splitmix64(self.seed ^ record_index).to_le_bytes();
            return pattern.into_iter().cycle().take(size).collect();
        }

        let mut state = self.seed ^ record_index.rotate_left(17);
        let mut output = Vec::with_capacity(size);
        while output.len() < size {
            state = splitmix64(state);
            output.extend_from_slice(&state.to_le_bytes());
        }
        output.truncate(size);
        output
    }
}

impl Default for FixtureGenerator {
    fn default() -> Self {
        Self::new(DEFAULT_SEED)
    }
}

/// Host and build metadata needed to reproduce and interpret a measurement.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Environment {
    /// Repository commit containing the measured implementation.
    pub source_commit: String,
    /// Full Rust compiler version string.
    pub rustc: String,
    /// Cargo profile used to build the benchmark executable.
    pub cargo_profile: String,
    /// Cargo feature selection used for the build.
    pub cargo_features: String,
    /// Host operating-system name.
    pub operating_system: String,
    /// Host kernel release.
    pub kernel: String,
    /// Host CPU model description.
    pub cpu_model: String,
    /// Number of logical processors visible to the process.
    pub logical_cpus: usize,
    /// Total host memory in bytes, when observable.
    pub memory_bytes: Option<u64>,
    /// Storage device containing the benchmark working directory.
    pub storage_device: String,
    /// Filesystem type containing the benchmark working directory.
    pub filesystem: String,
    /// Name and version of the measurement harness.
    pub measurement_tool: String,
}

/// Inputs that define one benchmark workload.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Workload {
    /// Payload shape used for submitted records.
    pub fixture: FixtureKind,
    /// Deterministic payload seed.
    pub seed: u64,
    /// Number of records appended per repetition.
    pub records: u64,
    /// Number of concurrent append producers.
    pub writers: usize,
    /// Number of finite readers exercised by the harness.
    pub readers: usize,
    /// Maximum number of concurrent operations admitted by the transport.
    pub bounded_concurrency: usize,
    /// Number of appends between snapshots, or `None` when snapshots are disabled.
    pub snapshot_frequency: Option<u64>,
    /// Unrecorded repetitions run before measurement.
    pub warmup_repetitions: u32,
    /// Recorded repetitions requested for the workload.
    pub measured_repetitions: u32,
}

/// Descriptive statistics for one non-empty set of observations.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Distribution {
    /// Number of observations summarized.
    pub samples: usize,
    /// Smallest observation.
    pub minimum: f64,
    /// Upper order statistic at zero-based rank `ceil((samples - 1) * 0.5)`.
    pub median: f64,
    /// Upper order statistic at zero-based rank `ceil((samples - 1) * 0.95)`.
    pub p95: f64,
    /// Largest observation.
    pub maximum: f64,
    /// Arithmetic mean of the observations.
    pub mean: f64,
    /// Sample standard deviation with Bessel's correction.
    pub sample_standard_deviation: f64,
    /// Sample standard deviation divided by the mean, or zero for a zero mean.
    pub coefficient_of_variation: f64,
}

/// Observations collected during one benchmark repetition.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Measurements {
    /// Backend construction time in microseconds.
    pub startup_microseconds: f64,
    /// Distribution of acknowledged storage append or session submit latency in microseconds.
    pub commit_latency_microseconds: Distribution,
    /// Storage appends or session submissions acknowledged per second across the commit phase.
    pub commit_throughput_records_per_second: f64,
    /// Time in microseconds to consume a finite read to its end.
    pub finite_read_microseconds: f64,
    /// Records observed by the finite read.
    pub finite_read_records: u64,
    /// Sum of snapshot publication durations in microseconds, when exercised.
    pub snapshot_publish_microseconds: Option<f64>,
    /// Clean reopen and verification duration in microseconds, when supported.
    pub recovery_microseconds: Option<f64>,
    /// Explicit reconnect duration in microseconds, when supported.
    pub reconnect_microseconds: Option<f64>,
    /// Process CPU consumed by the measured workload in microseconds, when observable.
    pub process_cpu_microseconds: Option<f64>,
    /// Process-wide peak resident memory in bytes, when observable.
    pub peak_resident_memory_bytes: Option<u64>,
    /// Sum of application payload bytes submitted by the workload.
    pub logical_payload_bytes: u64,
    /// Recursive size of persisted backend files in bytes, when applicable.
    pub persisted_bytes: Option<u64>,
    /// Bytes observed at the measured transport boundary, when available.
    pub wire_bytes: Option<u64>,
    /// Highest number of records waiting in a bounded local transport queue.
    pub peak_queued_records: Option<usize>,
    /// Highest number of active request streams observed by a server transport.
    pub peak_active_streams: Option<usize>,
}

/// One self-contained, schema-versioned benchmark repetition.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct BenchmarkResult {
    /// [`SCHEMA_VERSION`] used to encode this result.
    pub schema_version: u32,
    /// One-based repetition number within the invocation.
    pub repetition: u32,
    /// Stable backend identifier.
    pub implementation: String,
    /// API boundary at which operation timing begins and ends.
    pub measurement_boundary: MeasurementBoundary,
    /// Guarantees active for this backend and composition.
    pub active_guarantees: Vec<String>,
    /// Build and host metadata for the run.
    pub environment: Environment,
    /// Inputs defining the measured workload.
    pub workload: Workload,
    /// Observations produced by the repetition.
    pub measurements: Measurements,
}

/// Summarizes a non-empty set of observations.
///
/// # Panics
///
/// Panics when `values` is empty or contains more than `u32::MAX` samples.
#[must_use]
pub fn summarize(mut values: Vec<f64>) -> Distribution {
    assert!(
        !values.is_empty(),
        "a distribution requires at least one sample"
    );
    values.sort_by(f64::total_cmp);
    let samples = values.len();
    let sample_count = u32::try_from(samples).expect("sample count must fit in u32");
    let minimum = values[0];
    let maximum = values[samples - 1];
    let median = percentile(&values, 50, 100);
    let p95 = percentile(&values, 95, 100);
    let mean = values.iter().sum::<f64>() / f64::from(sample_count);
    let sample_standard_deviation = if samples > 1 {
        let squared_deviations = values
            .iter()
            .map(|value| (value - mean).powi(2))
            .sum::<f64>();
        (squared_deviations / f64::from(sample_count - 1)).sqrt()
    } else {
        0.0
    };
    let coefficient_of_variation = if mean == 0.0 {
        0.0
    } else {
        sample_standard_deviation / mean
    };
    Distribution {
        samples,
        minimum,
        median,
        p95,
        maximum,
        mean,
        sample_standard_deviation,
        coefficient_of_variation,
    }
}

/// Selects the upper order statistic at `ceil((len - 1) * numerator / denominator)`.
fn percentile(sorted: &[f64], numerator: usize, denominator: usize) -> f64 {
    let rank = ((sorted.len() - 1) * numerator).div_ceil(denominator);
    sorted[rank]
}

/// Mixes one 64-bit fixture state using the `SplitMix64` transform.
const fn splitmix64(mut value: u64) -> u64 {
    value = value.wrapping_add(0x9e37_79b9_7f4a_7c15);
    value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^ (value >> 31)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixtures_are_deterministic_and_distinct() {
        let generator = FixtureGenerator::default();
        for kind in [
            FixtureKind::Empty,
            FixtureKind::SmallCompressible,
            FixtureKind::SmallIncompressible,
            FixtureKind::LargeCompressible,
            FixtureKind::LargeIncompressible,
            FixtureKind::Snapshot,
        ] {
            assert_eq!(generator.payload(kind, 7), generator.payload(kind, 7));
            assert_eq!(generator.payload(kind, 7).len(), kind.payload_size());
        }
        assert_ne!(
            generator.payload(FixtureKind::SmallIncompressible, 7),
            generator.payload(FixtureKind::SmallIncompressible, 8)
        );
    }

    #[test]
    fn schema_round_trips_without_losing_optional_observations() {
        let result = BenchmarkResult {
            schema_version: SCHEMA_VERSION,
            repetition: 1,
            implementation: "test".to_owned(),
            measurement_boundary: MeasurementBoundary::Storage,
            active_guarantees: vec!["memory".to_owned()],
            environment: Environment {
                source_commit: "abc".to_owned(),
                rustc: "rustc test".to_owned(),
                cargo_profile: "release".to_owned(),
                cargo_features: "default".to_owned(),
                operating_system: "linux".to_owned(),
                kernel: "test".to_owned(),
                cpu_model: "test".to_owned(),
                logical_cpus: 1,
                memory_bytes: None,
                storage_device: "unknown".to_owned(),
                filesystem: "unknown".to_owned(),
                measurement_tool: "sea-benchmarks/0.1.0".to_owned(),
            },
            workload: Workload {
                fixture: FixtureKind::Empty,
                seed: DEFAULT_SEED,
                records: 1,
                writers: 1,
                readers: 1,
                bounded_concurrency: 1,
                snapshot_frequency: None,
                warmup_repetitions: 0,
                measured_repetitions: 1,
            },
            measurements: Measurements {
                startup_microseconds: 1.0,
                commit_latency_microseconds: summarize(vec![1.0]),
                commit_throughput_records_per_second: 1.0,
                finite_read_microseconds: 1.0,
                finite_read_records: 1,
                snapshot_publish_microseconds: None,
                recovery_microseconds: None,
                reconnect_microseconds: None,
                process_cpu_microseconds: None,
                peak_resident_memory_bytes: None,
                logical_payload_bytes: 0,
                persisted_bytes: None,
                wire_bytes: None,
                peak_queued_records: None,
                peak_active_streams: None,
            },
        };
        let encoded = serde_json::to_string(&result).expect("schema should serialize");
        let decoded: BenchmarkResult =
            serde_json::from_str(&encoded).expect("schema should deserialize");
        assert_eq!(decoded, result);
    }

    #[test]
    fn distribution_reports_tail_and_sample_variance() {
        let distribution = summarize(vec![1.0, 2.0, 3.0, 4.0, 5.0]);
        assert!((distribution.median - 3.0).abs() < f64::EPSILON);
        assert!((distribution.p95 - 5.0).abs() < f64::EPSILON);
        assert!(
            (distribution.sample_standard_deviation - 1.581_138_830_084_189_8).abs() < f64::EPSILON
        );
    }

    #[test]
    fn percentile_selects_boundary_and_upper_ranks() {
        let values = [1.0, 2.0];

        assert!((percentile(&values, 0, 100) - 1.0).abs() < f64::EPSILON);
        assert!((percentile(&values, 50, 100) - 2.0).abs() < f64::EPSILON);
        assert!((percentile(&values, 100, 100) - 2.0).abs() < f64::EPSILON);
    }
}
