use std::{fs, sync::Arc, time::Instant};

use async_trait::async_trait;
use bytes::Bytes;
use sea_service::{NativeService, ServiceConfig};
use sea_protocol::{
    Acknowledgement, Reference, Request, Response, SubmissionDisposition,
};
use sea_webtransport::{
    MeasurementHandle, TransportConfig, WebTransportClient, WebTransportServer,
};
use sea_client::{LifecycleEvent, NativeClient};
use wtransport::Identity;

use super::{
    Config, FixtureGenerator, FixtureKind, RunMeasurements, directory_bytes, elapsed_microseconds,
    unique_directory,
};

/// Minimal request boundary shared by direct and WebTransport service workloads.
#[async_trait(?Send)]
trait RequestTransport {
    /// Sends one complete protocol request and returns its response.
    async fn request(&mut self, request: Request) -> Result<Response, String>;

    /// Re-establishes the transport when the backend supports explicit reconnect.
    async fn reconnect(&mut self) -> Result<(), String> {
        Ok(())
    }

    /// Returns transport-specific byte and peak-stream observations.
    fn observations(&self) -> (Option<u64>, Option<usize>) {
        (None, None)
    }
}

/// In-process adapter around the native service request boundary.
struct DirectTransport {
    /// Service receiving requests without protocol serialization.
    service: Arc<NativeService>,
}

#[async_trait(?Send)]
impl RequestTransport for DirectTransport {
    async fn request(&mut self, request: Request) -> Result<Response, String> {
        Ok(self.service.handle(request).await)
    }
}

/// Native HTTP/3 adapter and the server-side measurement handles it owns.
struct WebTransport {
    /// Client used for request/response exchanges.
    client: WebTransportClient,
    /// Server-side transport counters shared with the runner.
    server_metrics: MeasurementHandle,
    /// Local server task aborted after the workload completes.
    server_task: tokio::task::JoinHandle<()>,
}

#[async_trait(?Send)]
impl RequestTransport for WebTransport {
    async fn request(&mut self, request: Request) -> Result<Response, String> {
        self.client
            .request(request)
            .await
            .map_err(super::display_error)
    }

    async fn reconnect(&mut self) -> Result<(), String> {
        self.client.disconnect();
        self.client.reconnect().await.map_err(super::display_error)
    }

    fn observations(&self) -> (Option<u64>, Option<usize>) {
        (
            Some(self.client.measurement().wire_bytes),
            Some(self.server_metrics.snapshot().peak_active_streams),
        )
    }
}

/// Exercises and reopens the native service through direct in-process dispatch.
pub(super) async fn run_native_service(config: &Config) -> Result<RunMeasurements, String> {
    validate_service_config(config)?;
    let directory = unique_directory("native-service");
    let startup = Instant::now();
    let service = Arc::new(NativeService::new(ServiceConfig::new(&directory)));
    let mut transport = DirectTransport {
        service: Arc::clone(&service),
    };
    let mut measurements =
        exercise_service(&mut transport, config, elapsed_microseconds(startup)).await?;
    drop(transport);
    drop(service);

    let recovery = Instant::now();
    let recovered = NativeService::new(ServiceConfig::new(&directory));
    verify_recovered_snapshot(
        &mut DirectTransport {
            service: Arc::new(recovered),
        },
        config,
    )
    .await?;
    measurements.recovery_microseconds = Some(elapsed_microseconds(recovery));
    measurements.persisted_bytes = Some(directory_bytes(&directory)?);
    fs::remove_dir_all(&directory).map_err(super::display_error)?;
    Ok(measurements)
}

/// Verifies that clean reopen recovers the expected latest snapshot state.
async fn verify_recovered_snapshot<T: RequestTransport>(
    transport: &mut T,
    config: &Config,
) -> Result<(), String> {
    let response = transport
        .request(Request::LatestSnapshot {
            document: Bytes::from_static(b"benchmark-document"),
        })
        .await?;
    match (config.snapshot_frequency, response) {
        (Some(_), Response::Snapshot(Some(snapshot)))
            if snapshot.payload.as_ref()
                == FixtureGenerator::new(config.seed)
                    .payload(FixtureKind::Snapshot, config.records) =>
        {
            Ok(())
        }
        (None, Response::Snapshot(None)) => Ok(()),
        (_, response) => Err(format!(
            "unexpected recovered snapshot response: {response:?}"
        )),
    }
}

/// Exercises the native service through a loopback WebTransport connection.
pub(super) async fn run_native_webtransport(config: &Config) -> Result<RunMeasurements, String> {
    validate_service_config(config)?;
    tokio::task::LocalSet::new()
        .run_until(async {
            let directory = unique_directory("native-webtransport");
            let startup = Instant::now();
            let identity =
                Identity::self_signed(["localhost", "127.0.0.1"]).map_err(super::display_error)?;
            let certificate_hash = identity.certificate_chain().as_slice()[0].hash();
            let server = WebTransportServer::bind(
                "127.0.0.1:0".parse().map_err(super::display_error)?,
                identity,
                Arc::new(NativeService::new(ServiceConfig::new(&directory))),
                TransportConfig::default(),
            )
            .map_err(super::display_error)?;
            let address = server.local_addr().map_err(super::display_error)?;
            let server_metrics = server.measurement_handle();
            let server_task = tokio::task::spawn_local(async move {
                let _ = server.serve().await;
            });
            let client = WebTransportClient::connect(
                format!("https://{address}/fluid"),
                certificate_hash,
                TransportConfig::default(),
            )
            .await
            .map_err(super::display_error)?;
            let mut transport = WebTransport {
                client,
                server_metrics,
                server_task,
            };
            let mut measurements =
                exercise_service(&mut transport, config, elapsed_microseconds(startup)).await?;
            measurements.persisted_bytes = Some(directory_bytes(&directory)?);
            transport.server_task.abort();
            let _ = transport.server_task.await;
            drop(transport.client);
            fs::remove_dir_all(&directory).map_err(super::display_error)?;
            Ok(measurements)
        })
        .await
}

/// Rejects workload shapes unsupported by the single-writer service lifecycle.
fn validate_service_config(config: &Config) -> Result<(), String> {
    if config.writers != 1 {
        return Err("native service workloads require exactly one lifecycle writer".to_owned());
    }
    if config.fixture.payload_size() > 512 * 1024 {
        return Err("fixture exceeds the service protocol payload bound".to_owned());
    }
    Ok(())
}

/// Runs the common create, submit, snapshot, read, and reconnect lifecycle.
async fn exercise_service<T: RequestTransport>(
    transport: &mut T,
    config: &Config,
    startup_microseconds: f64,
) -> Result<RunMeasurements, String> {
    let document = Bytes::from_static(b"benchmark-document");
    expect_acknowledgement(
        &transport
            .request(Request::Create {
                document: document.clone(),
            })
            .await?,
        Acknowledgement::Created,
    )?;
    let mut client = NativeClient::new(document.clone(), Bytes::from_static(b"writer"));
    let connect = client
        .connect(Bytes::from_static(b"session-1"), Reference::Initial)
        .map_err(super::display_error)?;
    apply_response(&mut client, transport.request(connect).await?)?;

    let generator = FixtureGenerator::new(config.seed);
    let mut append_latencies = Vec::with_capacity(
        usize::try_from(config.records).map_err(|_| "record count exceeds addressable memory")?,
    );
    let append_started = Instant::now();
    let mut reference = Reference::Initial;
    let mut parent = None;
    let mut snapshot_microseconds = 0.0;
    for index in 0..config.records {
        let request = client
            .submit(
                Bytes::from(format!("submission-{index}")),
                index + 1,
                reference.clone(),
                Bytes::from(generator.payload(config.fixture, index)),
            )
            .map_err(super::display_error)?;
        let started = Instant::now();
        let event = apply_response(&mut client, transport.request(request).await?)?;
        append_latencies.push(elapsed_microseconds(started));
        let LifecycleEvent::SubmissionAcknowledged(acknowledgement) = event else {
            return Err("service did not acknowledge submission".to_owned());
        };
        if acknowledgement.disposition != SubmissionDisposition::Accepted {
            return Err("service did not accept fresh submission".to_owned());
        }
        reference = Reference::At(acknowledgement.position);
        if config
            .snapshot_frequency
            .is_some_and(|frequency| (index + 1) % frequency == 0 || index + 1 == config.records)
        {
            let started = Instant::now();
            parent = Some(
                publish_snapshot(
                    transport,
                    &document,
                    reference.clone(),
                    parent,
                    Bytes::from(generator.payload(FixtureKind::Snapshot, index + 1)),
                )
                .await?,
            );
            snapshot_microseconds += elapsed_microseconds(started);
        }
    }
    let append_elapsed_seconds = append_started.elapsed().as_secs_f64();

    let read_started = Instant::now();
    let finite_read_records = verify_read(transport, config).await?;
    let finite_read_microseconds = elapsed_microseconds(read_started);

    client.disconnected();
    let reconnect_started = Instant::now();
    transport.reconnect().await?;
    let reconnect = client
        .connect(Bytes::from_static(b"session-2"), reference)
        .map_err(super::display_error)?;
    apply_response(&mut client, transport.request(reconnect).await?)?;
    let reconnect_microseconds = elapsed_microseconds(reconnect_started);
    let (wire_bytes, peak_active_streams) = transport.observations();

    Ok(RunMeasurements {
        startup_microseconds,
        append_latencies,
        append_elapsed_seconds,
        finite_read_microseconds,
        finite_read_records,
        snapshot_publish_microseconds: config.snapshot_frequency.map(|_| snapshot_microseconds),
        recovery_microseconds: None,
        reconnect_microseconds: Some(reconnect_microseconds),
        process_cpu_microseconds: None,
        peak_resident_memory_bytes: super::peak_resident_memory_bytes(),
        logical_payload_bytes: config.records
            * u64::try_from(config.fixture.payload_size())
                .map_err(|_| "fixture size exceeds measurement range")?,
        persisted_bytes: None,
        wire_bytes,
        peak_queued_records: None,
        peak_active_streams,
    })
}

/// Publishes a snapshot and returns the identifier observed by a subsequent read.
async fn publish_snapshot<T: RequestTransport>(
    transport: &mut T,
    document: &Bytes,
    includes_through: Reference,
    expected_parent: Option<Bytes>,
    payload: Bytes,
) -> Result<Bytes, String> {
    expect_acknowledgement(
        &transport
            .request(Request::PublishSnapshot {
                document: document.clone(),
                includes_through,
                expected_parent,
                payload,
            })
            .await?,
        Acknowledgement::SnapshotPublished,
    )?;
    match transport
        .request(Request::LatestSnapshot {
            document: document.clone(),
        })
        .await?
    {
        Response::Snapshot(Some(snapshot)) => Ok(snapshot.id),
        response => Err(format!("unexpected snapshot response: {response:?}")),
    }
}

/// Reads canonical records to the finite end and verifies acknowledged coverage.
async fn verify_read<T: RequestTransport>(
    transport: &mut T,
    config: &Config,
) -> Result<u64, String> {
    let document = Bytes::from_static(b"benchmark-document");
    let mut after = None;
    let mut count = 0_u64;
    loop {
        let records = match transport
            .request(Request::Read {
                document: document.clone(),
                after: after.clone(),
            })
            .await?
        {
            Response::Read { records } => records,
            response => return Err(format!("unexpected read response: {response:?}")),
        };
        if records.is_empty() {
            break;
        }
        count += u64::try_from(records.len())
            .map_err(|_| "service read count exceeds measurement range")?;
        after = records.last().map(|record| record.position.clone());
    }
    if count < config.records {
        return Err(format!(
            "service read returned fewer canonical records than acknowledged submissions: count={count}, submissions={}",
            config.records
        ));
    }
    Ok(count)
}

/// Applies a protocol response to the lifecycle client.
fn apply_response(client: &mut NativeClient, response: Response) -> Result<LifecycleEvent, String> {
    client
        .handle_response(response)
        .map_err(super::display_error)
}

/// Requires a response to contain the expected acknowledgement.
fn expect_acknowledgement(response: &Response, expected: Acknowledgement) -> Result<(), String> {
    if response == &Response::Acknowledged(expected) {
        Ok(())
    } else {
        Err(format!("unexpected service response: {response:?}"))
    }
}
