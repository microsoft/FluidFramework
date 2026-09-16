use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        OnceLock,
        atomic::{AtomicU64, Ordering},
    },
    time::Instant,
};

use bytes::Bytes;
use futures_util::TryStreamExt;
use sea_benchmarks::{
    BenchmarkResult, DEFAULT_SEED, Environment, FixtureGenerator, FixtureKind, Measurements,
    SCHEMA_VERSION, Workload, summarize,
};
use sea_compression::CompressionStream;
use sea_core::{EventStream, Snapshot, SnapshotPosition, SnapshotStore};
use sea_encryption::{ActiveKey, EncryptionKey, EncryptionStream, KeyId, KeyProvider};
use sea_file::FileStream;
use sea_memory::MemoryStream;
use sea_stateful_compression::StatefulCompressionStream;
use tokio::task::JoinSet;

/// Monotonic suffix for process-local temporary benchmark paths.
static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(1);

/// Storage or transport composition exercised by one workload.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Backend {
    /// In-process reference stream.
    Memory,
    /// Buffered single-process file stream.
    File,
    /// Independent zlib records over the file stream.
    Compression,
    /// Immutable-dictionary zstd records over the file stream.
    StatefulCompression,
    /// Authenticated encryption over the file stream.
    Encryption,
    /// Dictionary compression followed by authenticated encryption.
    StatefulCompressionEncryption,
}

/// Fixed representative dictionary shared by stateful-compression cells.
const DICTIONARY: &[u8] = b"tenant=alpha;document=shared;operation=insert;path=/items/;value=collaborative-content;sequence=00000000";

/// Fixed non-production key provider used only by encryption benchmark cells.
#[derive(Clone, Debug)]
struct BenchmarkKey;

impl KeyProvider for BenchmarkKey {
    fn active_key(&self) -> Option<ActiveKey> {
        Some(ActiveKey {
            id: KeyId::new([1; 16]),
            key: EncryptionKey::new([0x5a; 32]),
        })
    }

    fn key_for_id(&self, id: &KeyId) -> Option<EncryptionKey> {
        (*id == KeyId::new([1; 16])).then(|| EncryptionKey::new([0x5a; 32]))
    }
}

/// Validated command-line inputs for one benchmark workload.
#[derive(Clone, Debug, Eq, PartialEq)]
struct Config {
    /// Backend composition to exercise.
    backend: Backend,
    /// Payload shape for each record.
    fixture: FixtureKind,
    /// Deterministic payload seed.
    seed: u64,
    /// Records appended per repetition.
    records: u64,
    /// Concurrent append producers.
    writers: usize,
    /// Appends between snapshots, or `None` when disabled.
    snapshot_frequency: Option<u64>,
    /// Recorded repetitions.
    repetitions: u32,
    /// Unrecorded repetitions.
    warmups: u32,
}

/// Top-level operation selected by the command line.
#[derive(Debug, Eq, PartialEq)]
enum BenchmarkCommand {
    /// Print command usage.
    Help,
    /// Run bounded correctness workloads.
    Smoke,
    /// Execute the supplied measurement configuration.
    Measure(Config),
}

/// Raw observations collected before conversion to the public result schema.
#[derive(Debug)]
struct RunMeasurements {
    /// Backend construction time in microseconds.
    startup_microseconds: f64,
    /// Individual acknowledged append latencies in microseconds.
    append_latencies: Vec<f64>,
    /// Wall-clock duration of the append phase in seconds.
    append_elapsed_seconds: f64,
    /// Finite-read duration in microseconds.
    finite_read_microseconds: f64,
    /// Records observed by the finite read.
    finite_read_records: u64,
    /// Total snapshot publication time, when exercised.
    snapshot_publish_microseconds: Option<f64>,
    /// Clean reopen and verification time, when supported.
    recovery_microseconds: Option<f64>,
    /// Explicit reconnect time, when supported.
    reconnect_microseconds: Option<f64>,
    /// Process CPU consumed by the workload, when observable.
    process_cpu_microseconds: Option<f64>,
    /// Process-wide peak resident memory, when observable.
    peak_resident_memory_bytes: Option<u64>,
    /// Total application payload bytes submitted.
    logical_payload_bytes: u64,
    /// Recursive persisted file size, when applicable.
    persisted_bytes: Option<u64>,
    /// Bytes observed at the measured transport boundary.
    wire_bytes: Option<u64>,
    /// Peak queued records for bounded local transport.
    peak_queued_records: Option<usize>,
    /// Peak active request streams for server transport.
    peak_active_streams: Option<usize>,
}

/// Parses the command line and exits unsuccessfully on a harness error.
#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("benchmark failed: {error}");
        std::process::exit(1);
    }
}

/// Dispatches the selected help, smoke, or measurement command.
async fn run() -> Result<(), String> {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    match parse_command(&arguments)? {
        BenchmarkCommand::Help => {
            println!("{}", usage());
            Ok(())
        }
        BenchmarkCommand::Smoke => smoke().await,
        BenchmarkCommand::Measure(config) => measure(config).await,
    }
}

/// Parses the top-level command without reading process-global arguments.
fn parse_command(arguments: &[String]) -> Result<BenchmarkCommand, String> {
    match arguments {
        [argument] if matches!(argument.as_str(), "help" | "--help" | "-h") => {
            Ok(BenchmarkCommand::Help)
        }
        [command] if command == "smoke" => Ok(BenchmarkCommand::Smoke),
        [command, argument]
            if command == "measure" && matches!(argument.as_str(), "--help" | "-h") =>
        {
            Ok(BenchmarkCommand::Help)
        }
        [command, arguments @ ..] if command == "measure" => {
            parse_config(arguments).map(BenchmarkCommand::Measure)
        }
        [command, ..] if command == "smoke" => {
            Err(format!("smoke accepts no options\n{}", usage()))
        }
        _ => Err(usage()),
    }
}

/// Runs bounded correctness workloads across every supported backend.
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

    let mut integrated = snapshot.clone();
    integrated.records = 8;
    integrated.snapshot_frequency = Some(4);
    for backend in [
        Backend::Compression,
        Backend::StatefulCompression,
        Backend::Encryption,
        Backend::StatefulCompressionEncryption,
    ] {
        integrated.backend = backend;
        run_backend(&integrated).await?;
    }
    println!(
        "correctness smoke passed: memory writers=2; memory,file snapshot-frequency=16 records=32; Wave 3 adapters snapshot-frequency=4 records=8"
    );
    Ok(())
}

/// Executes warmups and emits one JSON result per measured repetition.
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
                Backend::Compression => "file-compression".to_owned(),
                Backend::StatefulCompression => "file-stateful-compression".to_owned(),
                Backend::Encryption => "file-encryption".to_owned(),
                Backend::StatefulCompressionEncryption => {
                    "file-stateful-compression-encryption".to_owned()
                }
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
                finite_read_records: measurements.finite_read_records,
                snapshot_publish_microseconds: measurements.snapshot_publish_microseconds,
                recovery_microseconds: measurements.recovery_microseconds,
                reconnect_microseconds: measurements.reconnect_microseconds,
                process_cpu_microseconds: measurements.process_cpu_microseconds,
                peak_resident_memory_bytes: measurements.peak_resident_memory_bytes,
                logical_payload_bytes: measurements.logical_payload_bytes,
                persisted_bytes: measurements.persisted_bytes,
                wire_bytes: measurements.wire_bytes,
                peak_queued_records: measurements.peak_queued_records,
                peak_active_streams: measurements.peak_active_streams,
            },
        };
        println!("{}", serde_json::to_string(&result).map_err(display_error)?);
    }
    Ok(())
}

/// Constructs and exercises the configured backend composition.
#[allow(clippy::too_many_lines)]
async fn run_backend(config: &Config) -> Result<RunMeasurements, String> {
    let cpu_started = process_cpu_microseconds();
    let mut measurements = match config.backend {
        Backend::Memory => {
            let startup = Instant::now();
            let stream = MemoryStream::new();
            run_stream(&stream, config, elapsed_microseconds(startup)).await?
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
            measurements
        }
        Backend::Compression => {
            let directory = unique_directory("compression");
            let startup = Instant::now();
            let stream =
                CompressionStream::new(FileStream::open(&directory).map_err(display_error)?);
            let mut measurements =
                run_stream(&stream, config, elapsed_microseconds(startup)).await?;
            drop(stream);
            measurements.persisted_bytes = Some(directory_bytes(&directory)?);
            let recovery = Instant::now();
            let reopened =
                CompressionStream::new(FileStream::open(&directory).map_err(display_error)?);
            verify_reopened_stream(&reopened, config).await?;
            measurements.recovery_microseconds = Some(elapsed_microseconds(recovery));
            drop(reopened);
            fs::remove_dir_all(&directory).map_err(display_error)?;
            measurements
        }
        Backend::StatefulCompression => {
            let directory = unique_directory("stateful-compression");
            let startup = Instant::now();
            let stream = StatefulCompressionStream::new(
                FileStream::open(&directory).map_err(display_error)?,
                Bytes::from_static(DICTIONARY),
                128 * 1024,
            )
            .map_err(display_error)?;
            let mut measurements =
                run_stream(&stream, config, elapsed_microseconds(startup)).await?;
            drop(stream);
            measurements.persisted_bytes = Some(directory_bytes(&directory)?);
            let recovery = Instant::now();
            let reopened = StatefulCompressionStream::new(
                FileStream::open(&directory).map_err(display_error)?,
                Bytes::from_static(DICTIONARY),
                128 * 1024,
            )
            .map_err(display_error)?;
            verify_reopened_stream(&reopened, config).await?;
            measurements.recovery_microseconds = Some(elapsed_microseconds(recovery));
            drop(reopened);
            fs::remove_dir_all(&directory).map_err(display_error)?;
            measurements
        }
        Backend::Encryption => {
            let directory = unique_directory("encryption");
            let startup = Instant::now();
            let stream = EncryptionStream::new(
                FileStream::open(&directory).map_err(display_error)?,
                BenchmarkKey,
            );
            let mut measurements =
                run_stream(&stream, config, elapsed_microseconds(startup)).await?;
            drop(stream);
            measurements.persisted_bytes = Some(directory_bytes(&directory)?);
            let recovery = Instant::now();
            let reopened = EncryptionStream::new(
                FileStream::open(&directory).map_err(display_error)?,
                BenchmarkKey,
            );
            verify_reopened_stream(&reopened, config).await?;
            measurements.recovery_microseconds = Some(elapsed_microseconds(recovery));
            drop(reopened);
            fs::remove_dir_all(&directory).map_err(display_error)?;
            measurements
        }
        Backend::StatefulCompressionEncryption => {
            let directory = unique_directory("stateful-compression-encryption");
            let startup = Instant::now();
            let encrypted = EncryptionStream::new(
                FileStream::open(&directory).map_err(display_error)?,
                BenchmarkKey,
            );
            let stream = StatefulCompressionStream::new(
                encrypted,
                Bytes::from_static(DICTIONARY),
                128 * 1024,
            )
            .map_err(display_error)?;
            let mut measurements =
                run_stream(&stream, config, elapsed_microseconds(startup)).await?;
            drop(stream);
            measurements.persisted_bytes = Some(directory_bytes(&directory)?);
            let recovery = Instant::now();
            let encrypted = EncryptionStream::new(
                FileStream::open(&directory).map_err(display_error)?,
                BenchmarkKey,
            );
            let reopened = StatefulCompressionStream::new(
                encrypted,
                Bytes::from_static(DICTIONARY),
                128 * 1024,
            )
            .map_err(display_error)?;
            verify_reopened_stream(&reopened, config).await?;
            measurements.recovery_microseconds = Some(elapsed_microseconds(recovery));
            drop(reopened);
            fs::remove_dir_all(&directory).map_err(display_error)?;
            measurements
        }
    };
    measurements.process_cpu_microseconds = cpu_started
        .zip(process_cpu_microseconds())
        .map(|(started, finished)| finished - started);
    Ok(measurements)
}

/// Runs the append, optional snapshot, and finite-read workload on a stream.
async fn run_stream<S>(
    stream: &S,
    config: &Config,
    startup_microseconds: f64,
) -> Result<RunMeasurements, String>
where
    S: EventStream
        + SnapshotStore<Position = <S as EventStream>::Position, Error = <S as EventStream>::Error>
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
                                    at_event: SnapshotPosition::At(receipt.position),
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
        finite_read_records: config.records,
        snapshot_publish_microseconds,
        recovery_microseconds: None,
        reconnect_microseconds: None,
        process_cpu_microseconds: None,
        peak_resident_memory_bytes: peak_resident_memory_bytes(),
        logical_payload_bytes: config.records
            * u64::try_from(config.fixture.payload_size())
                .map_err(|_| "fixture size exceeds measurement range")?,
        persisted_bytes: None,
        wire_bytes: None,
        peak_queued_records: None,
        peak_active_streams: None,
    })
}

/// Verifies record count and an order-independent digest of generated payloads.
fn verify_payloads<P>(
    records: &[sea_core::CommittedEvent<P>],
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

/// Verifies that the plain file stream preserved records and a snapshot.
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

/// Verifies records and optional snapshot state after reopening a wrapper stack.
async fn verify_reopened_stream<S>(stream: &S, config: &Config) -> Result<(), String>
where
    S: EventStream
        + SnapshotStore<Position = <S as EventStream>::Position, Error = <S as EventStream>::Error>,
{
    let generator = FixtureGenerator::new(config.seed);
    let records = stream
        .read(None)
        .await
        .map_err(display_error)?
        .try_collect::<Vec<_>>()
        .await
        .map_err(display_error)?;
    verify_payloads(&records, &generator, config)?;
    if config.snapshot_frequency.is_some()
        && stream.latest().await.map_err(display_error)?.is_none()
    {
        return Err("reopened wrapper did not preserve its snapshot".to_owned());
    }
    Ok(())
}

/// Parses and validates measurement options from argument pairs.
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

/// Maps a stable command-line backend name to its composition.
fn parse_backend(value: &str) -> Result<Backend, String> {
    match value {
        "memory" => Ok(Backend::Memory),
        "file" => Ok(Backend::File),
        "compression" => Ok(Backend::Compression),
        "stateful-compression" => Ok(Backend::StatefulCompression),
        "encryption" => Ok(Backend::Encryption),
        "stateful-compression-encryption" => Ok(Backend::StatefulCompressionEncryption),
        _ => Err(format!("unknown backend: {value}")),
    }
}

/// Maps a stable command-line fixture name to its payload shape.
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

/// Describes guarantees active for the selected backend result.
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
        Backend::Compression => wrapper_guarantees("independent zlib compression"),
        Backend::StatefulCompression => {
            wrapper_guarantees("bounded immutable-dictionary zstd compression")
        }
        Backend::Encryption => wrapper_guarantees("AES-256-GCM-SIV authenticated encryption"),
        Backend::StatefulCompressionEncryption => vec![
            "single-process ownership".to_owned(),
            "buffered file durability without sync".to_owned(),
            "bounded immutable-dictionary zstd compression before encryption".to_owned(),
            "AES-256-GCM-SIV authenticated encryption".to_owned(),
            "finite reads".to_owned(),
            "snapshot publication".to_owned(),
        ],
    }
}

/// Builds the common guarantee list for file-backed wrappers.
fn wrapper_guarantees(wrapper: &str) -> Vec<String> {
    vec![
        "single-process ownership".to_owned(),
        "buffered file durability without sync".to_owned(),
        wrapper.to_owned(),
        "finite reads".to_owned(),
        "snapshot publication".to_owned(),
    ]
}

/// Captures available build and host metadata without inventing missing values.
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
        measurement_tool: format!("sea-benchmarks/{}", env!("CARGO_PKG_VERSION")),
    }
}

/// Captures trimmed command output or returns `unknown` on failure.
fn command_output(program: &str, arguments: &[&str]) -> String {
    Command::new(program)
        .args(arguments)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map_or_else(|| "unknown".to_owned(), |value| value.trim().to_owned())
}

/// Reads the first Linux CPU model description when available.
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

/// Reads total host memory from Linux procfs when available.
fn memory_bytes() -> Option<u64> {
    proc_status_value("/proc/meminfo", "MemTotal:").map(|kilobytes| kilobytes * 1_024)
}

/// Reads process-wide peak resident memory from Linux procfs when available.
fn peak_resident_memory_bytes() -> Option<u64> {
    proc_status_value("/proc/self/status", "VmHWM:").map(|kilobytes| kilobytes * 1_024)
}

/// Reads a numeric kilobyte value with the supplied procfs line prefix.
fn proc_status_value(path: &str, prefix: &str) -> Option<u64> {
    fs::read_to_string(path).ok()?.lines().find_map(|line| {
        line.strip_prefix(prefix)?
            .split_whitespace()
            .next()?
            .parse()
            .ok()
    })
}

/// Sums file sizes recursively without following directory symlinks.
fn directory_bytes(directory: &Path) -> Result<u64, String> {
    fs::read_dir(directory)
        .map_err(display_error)?
        .try_fold(0_u64, |total, entry| {
            let entry = entry.map_err(display_error)?;
            let metadata = entry.metadata().map_err(display_error)?;
            if metadata.is_dir() {
                Ok(total + directory_bytes(&entry.path())?)
            } else {
                Ok(total + metadata.len())
            }
        })
}

/// Reads cumulative user and system CPU time from Linux procfs.
fn process_cpu_microseconds() -> Option<f64> {
    static CLOCK_TICKS: OnceLock<Option<f64>> = OnceLock::new();
    let ticks_per_second = *CLOCK_TICKS.get_or_init(|| {
        command_output("getconf", &["CLK_TCK"])
            .parse::<f64>()
            .ok()
            .filter(|value| *value > 0.0)
    });
    let stat = fs::read_to_string("/proc/self/stat").ok()?;
    let fields = stat
        .rsplit_once(") ")?
        .1
        .split_whitespace()
        .collect::<Vec<_>>();
    let user_ticks = fields.get(11)?.parse::<u64>().ok()?;
    let system_ticks = fields.get(12)?.parse::<u64>().ok()?;
    let process_ticks = u32::try_from(user_ticks + system_ticks).ok()?;
    Some(f64::from(process_ticks) * 1_000_000.0 / ticks_per_second?)
}

/// Returns a process-unique temporary path for one backend run.
fn unique_directory(label: &str) -> PathBuf {
    let sequence = NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed);
    env::temp_dir().join(format!(
        "sea-benchmark-{}-{label}-{sequence}",
        std::process::id()
    ))
}

/// Computes a stable non-cryptographic payload digest for correctness checks.
fn payload_digest(payload: &[u8]) -> u64 {
    payload.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x1000_0000_01b3)
    })
}

/// Converts elapsed monotonic time to microseconds.
fn elapsed_microseconds(started: Instant) -> f64 {
    started.elapsed().as_secs_f64() * 1_000_000.0
}

/// Adapts displayable errors to the harness's string error boundary.
fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

/// Returns the complete command-line grammar.
fn usage() -> String {
    "usage: sea-benchmarks smoke | measure [--backend memory|file|compression|stateful-compression|encryption|stateful-compression-encryption] [--fixture empty|small-compressible|small-incompressible|large-compressible|large-incompressible|snapshot] [--seed N] [--records N] [--writers N] [--snapshot-frequency N] [--warmups N] [--repetitions N]".to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_parser_accepts_help_for_program_and_measurement() {
        for arguments in [&["--help"][..], &["-h"], &["help"], &["measure", "--help"]] {
            let arguments = arguments
                .iter()
                .map(|value| (*value).to_owned())
                .collect::<Vec<_>>();
            assert_eq!(parse_command(&arguments), Ok(BenchmarkCommand::Help));
        }
    }

    #[test]
    fn command_parser_rejects_ignored_smoke_options() {
        let arguments = ["smoke".to_owned(), "--records".to_owned(), "1".to_owned()];

        assert!(parse_command(&arguments).is_err());
    }
}
