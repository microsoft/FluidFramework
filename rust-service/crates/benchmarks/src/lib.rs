#![doc = "Deterministic fixtures and result schema for snapshotted-stream benchmarks."]

use serde::{Deserialize, Serialize};

pub const SCHEMA_VERSION: u32 = 2;
pub const DEFAULT_SEED: u64 = 0x4d59_5df4_d0f3_3173;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum FixtureKind {
    Empty,
    SmallCompressible,
    SmallIncompressible,
    LargeCompressible,
    LargeIncompressible,
    Snapshot,
}

impl FixtureKind {
    #[must_use]
    pub const fn payload_size(self) -> usize {
        match self {
            Self::Empty => 0,
            Self::SmallCompressible | Self::SmallIncompressible => 64,
            Self::LargeCompressible | Self::LargeIncompressible => 65_536,
            Self::Snapshot => 8,
        }
    }

    #[must_use]
    pub const fn is_compressible(self) -> bool {
        matches!(self, Self::SmallCompressible | Self::LargeCompressible)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FixtureGenerator {
    seed: u64,
}

impl FixtureGenerator {
    #[must_use]
    pub const fn new(seed: u64) -> Self {
        Self { seed }
    }

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

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Environment {
    pub source_commit: String,
    pub rustc: String,
    pub cargo_profile: String,
    pub cargo_features: String,
    pub operating_system: String,
    pub kernel: String,
    pub cpu_model: String,
    pub logical_cpus: usize,
    pub memory_bytes: Option<u64>,
    pub storage_device: String,
    pub filesystem: String,
    pub measurement_tool: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Workload {
    pub fixture: FixtureKind,
    pub seed: u64,
    pub records: u64,
    pub writers: usize,
    pub readers: usize,
    pub bounded_concurrency: usize,
    pub snapshot_frequency: Option<u64>,
    pub warmup_repetitions: u32,
    pub measured_repetitions: u32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Distribution {
    pub samples: usize,
    pub minimum: f64,
    pub median: f64,
    pub p95: f64,
    pub maximum: f64,
    pub mean: f64,
    pub sample_standard_deviation: f64,
    pub coefficient_of_variation: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Measurements {
    pub startup_microseconds: f64,
    pub append_latency_microseconds: Distribution,
    pub append_throughput_records_per_second: f64,
    pub finite_read_microseconds: f64,
    pub snapshot_publish_microseconds: Option<f64>,
    pub recovery_microseconds: Option<f64>,
    pub reconnect_microseconds: Option<f64>,
    pub process_cpu_microseconds: Option<f64>,
    pub peak_resident_memory_bytes: Option<u64>,
    pub logical_payload_bytes: u64,
    pub persisted_bytes: Option<u64>,
    pub wire_bytes: Option<u64>,
    pub peak_queued_records: Option<usize>,
    pub peak_active_streams: Option<usize>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct BenchmarkResult {
    pub schema_version: u32,
    pub repetition: u32,
    pub implementation: String,
    pub active_guarantees: Vec<String>,
    pub environment: Environment,
    pub workload: Workload,
    pub measurements: Measurements,
}

#[must_use]
/// Summarizes a non-empty set of observations.
///
/// # Panics
///
/// Panics when `values` is empty or contains more than `u32::MAX` samples.
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

fn percentile(sorted: &[f64], numerator: usize, denominator: usize) -> f64 {
    let rank = ((sorted.len() - 1) * numerator).div_ceil(denominator);
    sorted[rank]
}

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
                measurement_tool: "snapshotted-stream-benchmarks/0.1.0".to_owned(),
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
                append_latency_microseconds: summarize(vec![1.0]),
                append_throughput_records_per_second: 1.0,
                finite_read_microseconds: 1.0,
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
}
