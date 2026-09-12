use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicU64, Ordering},
    time::Instant,
};

use bytes::Bytes;
use futures_util::TryStreamExt;
use snapshotted_stream_benchmarks::{
    BenchmarkResult, DEFAULT_SEED, Environment, FixtureGenerator, FixtureKind, Measurements,
    SCHEMA_VERSION, Workload, summarize,
};
use snapshotted_stream_core::{AppendStream, Snapshot, SnapshotPosition, SnapshotStore};
use snapshotted_stream_file_simple::FileStream;
use snapshotted_stream_memory::MemoryStream;
use tokio::task::JoinSet;

static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Backend {
    Memory,
    File,
}

#[derive(Clone, Debug)]
struct Config {
    backend: Backend,
    fixture: FixtureKind,
    seed: u64,
    records: u64,
    writers: usize,
    snapshot_frequency: Option<u64>,
    repetitions: u32,
    warmups: u32,
}

#[derive(Debug)]
struct RunMeasurements {
    startup_microseconds: f64,
    append_latencies: Vec<f64>,
    append_elapsed_seconds: f64,
    finite_read_microseconds: f64,
    snapshot_publish_microseconds: Option<f64>,
    recovery_microseconds: Option<f64>,
    peak_resident_memory_bytes: Option<u64>,
    logical_payload_bytes: u64,
    persisted_bytes: Option<u64>,
}

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("benchmark failed: {error}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    match arguments.first().map(String::as_str) {
        Some("smoke") => smoke().await,
        Some("measure") => measure(parse_config(&arguments[1..])?).await,
        _ => Err(usage()),
    }
}

async fn smoke() -> Result<(), String> {
    let concurrent = Config {
        backend: Backend::Memory,
        fixture: FixtureKind::SmallIncompressible,
        seed: DEFAULT_SEED,
        records: 32,
        writers: 2,
        snapshot_frequency: None,
        repetitions: 1,
        warmups: 0,
    };
    let startup = Instant::now();
    let memory = MemoryStream::new();
    run_stream(&memory, &concurrent, elapsed_microseconds(startup))
        .await
        .map(|_| ())?;

    let mut snapshot = concurrent.clone();
    snapshot.writers = 1;
    snapshot.snapshot_frequency = Some(16);
    let startup = Instant::now();
    let memory = MemoryStream::new();
    run_stream(&memory, &snapshot, elapsed_microseconds(startup))
        .await
        .map(|_| ())?;

    let directory = unique_directory("smoke");
    let startup = Instant::now();
    let file = FileStream::open(&directory).map_err(display_error)?;
    run_stream(&file, &snapshot, elapsed_microseconds(startup)).await?;
    drop(file);
    let reopened = FileStream::open(&directory).map_err(display_error)?;
    verify_reopened(&reopened, snapshot.records).await?;
    drop(reopened);
    fs::remove_dir_all(&directory).map_err(display_error)?;
    println!(
        "correctness smoke passed: memory writers=2; memory,file snapshot-frequency=16 records=32"
    );
    Ok(())
}

async fn measure(config: Config) -> Result<(), String> {
    for _ in 0..config.warmups {
        run_backend(&config).await?;
    }
    let environment = environment();
    for repetition in 1..=config.repetitions {
        let measurements = run_backend(&config).await?;
        let throughput = if measurements.append_elapsed_seconds == 0.0 {
            0.0
        } else {
            f64::from(
                u32::try_from(config.records)
                    .map_err(|_| "record count exceeds measurement range")?,
            ) / measurements.append_elapsed_seconds
        };
        let result = BenchmarkResult {
            schema_version: SCHEMA_VERSION,
            repetition,
            implementation: match config.backend {
                Backend::Memory => "memory".to_owned(),
                Backend::File => "file-simple".to_owned(),
            },
            active_guarantees: guarantees(config.backend),
            environment: environment.clone(),
            workload: Workload {
                fixture: config.fixture,
                seed: config.seed,
                records: config.records,
                writers: config.writers,
                readers: 1,
                bounded_concurrency: config.writers,
                snapshot_frequency: config.snapshot_frequency,
                warmup_repetitions: config.warmups,
                measured_repetitions: config.repetitions,
            },
            measurements: Measurements {
                startup_microseconds: measurements.startup_microseconds,
                append_latency_microseconds: summarize(measurements.append_latencies),
                append_throughput_records_per_second: throughput,
                finite_read_microseconds: measurements.finite_read_microseconds,
                snapshot_publish_microseconds: measurements.snapshot_publish_microseconds,
                recovery_microseconds: measurements.recovery_microseconds,
                reconnect_microseconds: None,
                peak_resident_memory_bytes: measurements.peak_resident_memory_bytes,
                logical_payload_bytes: measurements.logical_payload_bytes,
                persisted_bytes: measurements.persisted_bytes,
                wire_bytes: None,
            },
        };
        println!("{}", serde_json::to_string(&result).map_err(display_error)?);
    }
    Ok(())
}

async fn run_backend(config: &Config) -> Result<RunMeasurements, String> {
    match config.backend {
        Backend::Memory => {
            let startup = Instant::now();
            let stream = MemoryStream::new();
            run_stream(&stream, config, elapsed_microseconds(startup)).await
        }
        Backend::File => {
            let directory = unique_directory("measure");
            let startup = Instant::now();
            let stream = FileStream::open(&directory).map_err(display_error)?;
            let mut measurements =
                run_stream(&stream, config, elapsed_microseconds(startup)).await?;
            drop(stream);
            measurements.persisted_bytes = Some(directory_bytes(&directory)?);
            let recovery = Instant::now();
            let reopened = FileStream::open(&directory).map_err(display_error)?;
            verify_reopened(&reopened, config.records).await?;
            measurements.recovery_microseconds = Some(elapsed_microseconds(recovery));
            drop(reopened);
            fs::remove_dir_all(&directory).map_err(display_error)?;
            Ok(measurements)
        }
    }
}

async fn run_stream<S>(
    stream: &S,
    config: &Config,
    startup_microseconds: f64,
) -> Result<RunMeasurements, String>
where
    S: AppendStream
        + SnapshotStore<Position = <S as AppendStream>::Position, Error = <S as AppendStream>::Error>
        + Clone
        + 'static,
{
    let generator = FixtureGenerator::new(config.seed);
    let record_capacity =
        usize::try_from(config.records).map_err(|_| "record count exceeds addressable memory")?;
    let append_started = Instant::now();
    let (append_latencies, snapshot_publish_microseconds) =
        if let Some(snapshot_frequency) = config.snapshot_frequency {
            if config.writers != 1 {
                return Err("periodic snapshots require exactly one writer".to_owned());
            }
            let mut latencies = Vec::with_capacity(record_capacity);
            let mut snapshot_elapsed = 0.0;
            let mut parent = None;
            for index in 0..config.records {
                let payload = Bytes::from(generator.payload(config.fixture, index));
                let started = Instant::now();
                let receipt = stream.append(payload).await.map_err(display_error)?;
                latencies.push(elapsed_microseconds(started));
                if (index + 1) % snapshot_frequency == 0 || index + 1 == config.records {
                    let started = Instant::now();
                    parent = Some(
                        stream
                            .publish(
                                Snapshot {
                                    includes_through: SnapshotPosition::At(receipt.position),
                                    payload: Bytes::from(
                                        generator.payload(FixtureKind::Snapshot, index + 1),
                                    ),
                                },
                                parent.as_ref(),
                            )
                            .await
                            .map_err(display_error)?,
                    );
                    snapshot_elapsed += elapsed_microseconds(started);
                }
            }
            (latencies, Some(snapshot_elapsed))
        } else {
            let mut tasks = JoinSet::new();
            for writer in 0..config.writers {
                let stream = stream.clone();
                let generator = generator.clone();
                let fixture = config.fixture;
                let records = config.records;
                let writers = config.writers;
                tasks.spawn(async move {
                    let mut latencies = Vec::new();
                    let first_index =
                        u64::try_from(writer).map_err(|_| "writer index exceeds workload range")?;
                    for index in (first_index..records).step_by(writers) {
                        let payload = Bytes::from(generator.payload(fixture, index));
                        let started = Instant::now();
                        stream.append(payload).await.map_err(display_error)?;
                        latencies.push(elapsed_microseconds(started));
                    }
                    Ok::<_, String>(latencies)
                });
            }
            let mut latencies = Vec::with_capacity(record_capacity);
            while let Some(result) = tasks.join_next().await {
                latencies.extend(result.map_err(display_error)??);
            }
            (latencies, None)
        };
    let append_elapsed_seconds = append_started.elapsed().as_secs_f64();
    if append_latencies.len() != record_capacity {
        return Err("append count did not match workload".to_owned());
    }

    let read_started = Instant::now();
    let records = stream
        .read(None)
        .await
        .map_err(display_error)?
        .try_collect::<Vec<_>>()
        .await
        .map_err(display_error)?;
    let finite_read_microseconds = elapsed_microseconds(read_started);
    verify_payloads(&records, &generator, config)?;

    Ok(RunMeasurements {
        startup_microseconds,
        append_latencies,
        append_elapsed_seconds,
        finite_read_microseconds,
        snapshot_publish_microseconds,
        recovery_microseconds: None,
        peak_resident_memory_bytes: peak_resident_memory_bytes(),
        logical_payload_bytes: config.records
            * u64::try_from(config.fixture.payload_size())
                .map_err(|_| "fixture size exceeds measurement range")?,
        persisted_bytes: None,
    })
}

fn verify_payloads<P>(
    records: &[snapshotted_stream_core::ReadRecord<P>],
    generator: &FixtureGenerator,
    config: &Config,
) -> Result<(), String> {
    let expected_records =
        usize::try_from(config.records).map_err(|_| "record count exceeds addressable memory")?;
    if records.len() != expected_records {
        return Err(format!(
            "finite read returned {} records; expected {}",
            records.len(),
            config.records
        ));
    }
    let actual = records.iter().fold(0_u64, |digest, record| {
        digest ^ payload_digest(&record.payload)
    });
    let expected = (0..config.records).fold(0_u64, |digest, index| {
        digest ^ payload_digest(&generator.payload(config.fixture, index))
    });
    if actual != expected {
        return Err("finite read payload digest did not match fixtures".to_owned());
    }
    Ok(())
}

async fn verify_reopened(stream: &FileStream, expected_records: u64) -> Result<(), String> {
    let records = stream
        .read(None)
        .await
        .map_err(display_error)?
        .try_collect::<Vec<_>>()
        .await
        .map_err(display_error)?;
    let expected_records =
        usize::try_from(expected_records).map_err(|_| "record count exceeds addressable memory")?;
    if records.len() != expected_records {
        return Err("reopened file stream did not preserve every record".to_owned());
    }
    if stream.latest().await.map_err(display_error)?.is_none() {
        return Err("reopened file stream did not preserve its snapshot".to_owned());
    }
    Ok(())
}

fn parse_config(arguments: &[String]) -> Result<Config, String> {
    let mut config = Config {
        backend: Backend::Memory,
        fixture: FixtureKind::SmallCompressible,
        seed: DEFAULT_SEED,
        records: 10_000,
        writers: 1,
        snapshot_frequency: Some(1_000),
        repetitions: 5,
        warmups: 1,
    };
    let mut index = 0;
    while index < arguments.len() {
        let value = arguments
            .get(index + 1)
            .ok_or_else(|| format!("missing value for {}", arguments[index]))?;
        match arguments[index].as_str() {
            "--backend" => config.backend = parse_backend(value)?,
            "--fixture" => config.fixture = parse_fixture(value)?,
            "--seed" => config.seed = value.parse().map_err(display_error)?,
            "--records" => config.records = value.parse().map_err(display_error)?,
            "--writers" => config.writers = value.parse().map_err(display_error)?,
            "--snapshot-frequency" => {
                let frequency = value.parse().map_err(display_error)?;
                config.snapshot_frequency = (frequency != 0).then_some(frequency);
            }
            "--repetitions" => config.repetitions = value.parse().map_err(display_error)?,
            "--warmups" => config.warmups = value.parse().map_err(display_error)?,
            unknown => return Err(format!("unknown option: {unknown}\n{}", usage())),
        }
        index += 2;
    }
    if config.records == 0 || config.writers == 0 || config.repetitions == 0 {
        return Err("records, writers, and repetitions must be non-zero".to_owned());
    }
    Ok(config)
}

fn parse_backend(value: &str) -> Result<Backend, String> {
    match value {
        "memory" => Ok(Backend::Memory),
        "file" => Ok(Backend::File),
        _ => Err(format!("unknown backend: {value}")),
    }
}

fn parse_fixture(value: &str) -> Result<FixtureKind, String> {
    match value {
        "empty" => Ok(FixtureKind::Empty),
        "small-compressible" => Ok(FixtureKind::SmallCompressible),
        "small-incompressible" => Ok(FixtureKind::SmallIncompressible),
        "large-compressible" => Ok(FixtureKind::LargeCompressible),
        "large-incompressible" => Ok(FixtureKind::LargeIncompressible),
        "snapshot" => Ok(FixtureKind::Snapshot),
        _ => Err(format!("unknown fixture: {value}")),
    }
}

fn guarantees(backend: Backend) -> Vec<String> {
    match backend {
        Backend::Memory => vec![
            "in-process visibility".to_owned(),
            "memory durability".to_owned(),
            "finite reads".to_owned(),
            "snapshot publication".to_owned(),
        ],
        Backend::File => vec![
            "single-process ownership".to_owned(),
            "buffered file durability without sync".to_owned(),
            "clean reopen".to_owned(),
            "finite reads".to_owned(),
            "snapshot publication".to_owned(),
        ],
    }
}

fn environment() -> Environment {
    Environment {
        source_commit: env::var("BENCHMARK_SOURCE_COMMIT").unwrap_or_else(|_| "unknown".to_owned()),
        rustc: command_output("rustc", &["--version"]),
        cargo_profile: env::var("BENCHMARK_PROFILE").unwrap_or_else(|_| "unknown".to_owned()),
        cargo_features: env::var("BENCHMARK_FEATURES").unwrap_or_else(|_| "unknown".to_owned()),
        operating_system: env::consts::OS.to_owned(),
        kernel: command_output("uname", &["-srmo"]),
        cpu_model: cpu_model(),
        logical_cpus: std::thread::available_parallelism().map_or(0, usize::from),
        memory_bytes: memory_bytes(),
        storage_device: env::var("BENCHMARK_STORAGE_DEVICE")
            .unwrap_or_else(|_| "unknown".to_owned()),
        filesystem: env::var("BENCHMARK_FILESYSTEM").unwrap_or_else(|_| "unknown".to_owned()),
        measurement_tool: format!(
            "snapshotted-stream-benchmarks/{}",
            env!("CARGO_PKG_VERSION")
        ),
    }
}

fn command_output(program: &str, arguments: &[&str]) -> String {
    Command::new(program)
        .args(arguments)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map_or_else(|| "unknown".to_owned(), |value| value.trim().to_owned())
}

fn cpu_model() -> String {
    fs::read_to_string("/proc/cpuinfo")
        .ok()
        .and_then(|contents| {
            contents.lines().find_map(|line| {
                line.strip_prefix("model name\t:")
                    .map(|value| value.trim().to_owned())
            })
        })
        .unwrap_or_else(|| "unknown".to_owned())
}

fn memory_bytes() -> Option<u64> {
    proc_status_value("/proc/meminfo", "MemTotal:").map(|kilobytes| kilobytes * 1_024)
}

fn peak_resident_memory_bytes() -> Option<u64> {
    proc_status_value("/proc/self/status", "VmHWM:").map(|kilobytes| kilobytes * 1_024)
}

fn proc_status_value(path: &str, prefix: &str) -> Option<u64> {
    fs::read_to_string(path).ok()?.lines().find_map(|line| {
        line.strip_prefix(prefix)?
            .split_whitespace()
            .next()?
            .parse()
            .ok()
    })
}

fn directory_bytes(directory: &Path) -> Result<u64, String> {
    fs::read_dir(directory)
        .map_err(display_error)?
        .try_fold(0_u64, |total, entry| {
            let entry = entry.map_err(display_error)?;
            let metadata = entry.metadata().map_err(display_error)?;
            Ok(total + metadata.len())
        })
}

fn unique_directory(label: &str) -> PathBuf {
    let sequence = NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed);
    env::temp_dir().join(format!(
        "snapshotted-stream-benchmark-{}-{label}-{sequence}",
        std::process::id()
    ))
}

fn payload_digest(payload: &[u8]) -> u64 {
    payload.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x1000_0000_01b3)
    })
}

fn elapsed_microseconds(started: Instant) -> f64 {
    started.elapsed().as_secs_f64() * 1_000_000.0
}

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn usage() -> String {
    "usage: snapshotted-stream-benchmarks smoke | measure [--backend memory|file] [--fixture empty|small-compressible|small-incompressible|large-compressible|large-incompressible|snapshot] [--seed N] [--records N] [--writers N] [--snapshot-frequency N] [--warmups N] [--repetitions N]".to_owned()
}
