# Self-Hosted Fluid: Validated Reference Deployment, Boundaries, and Team Handoff

**Status:** Final project handoff  
**Validation cutoff:** 2026-07-10

## 1. Executive conclusion

This project produced and exercised a self-hosted Fluid reference deployment using full Routerlicious, Redpanda, MongoDB, Redis, historian, and gitrest. It was deployed locally and to Azure Kubernetes Service (AKS) with images built from FluidFramework source and stored in Azure Container Registry (ACR).

A real Fluid client running locally connected to the Azure-hosted service and completed the collaboration path: connect, create and attach a document, exchange real-time operations, load the existing document in a second client, converge to the same state, and observe both clients in the audience.

The recommended baseline is **full Routerlicious with Redpanda**. It stays on the full Routerlicious service topology while replacing the heavier Kafka and ZooKeeper pair with one Kafka-compatible broker service. The delivered Azure configuration is a **validated reference deployment**, not a production-ready managed service.

The project is complete for this bounded purpose. Remaining work is captured as an explicit productionization handoff.

## 2. Scope and non-goals

### In scope

- A source-built, self-hosted Fluid service.
- Local Docker deployment instructions.
- An Azure AKS reference deployment.
- Durable document metadata, operations, and snapshots.
- Real-client end-to-end collaboration evidence.
- A practical operator runbook and troubleshooting record.
- Explicit production boundaries and ownership decisions.

### Not delivered

- A Microsoft-operated managed service or SLA.
- Production identity integration or a finished token service.
- TLS, custom DNS, or certificate lifecycle management.
- Multi-node broker or database high availability.
- Production capacity guarantees or WAN-scale benchmarks.
- Automated backup, restore, monitoring, or incident response.
- A zero-downtime migration service.
- An adapter connecting OSS gitrest to Azure Blob or another customer-preferred snapshot backend.

## 3. Delivered reference architecture

### Application and ordering tier

- Full Routerlicious services: alfred, nexus, deli, scriptorium, scribe, and riddler.
- Redpanda exposes the Kafka protocol used by the existing Routerlicious orderer path.
- Redis provides pub/sub and cache functions.

### Persistence tier

- MongoDB stores document metadata, operations, and checkpoints on a managed-disk persistent volume.
- historian and gitrest store snapshots on an Azure Files persistent volume.
- Redpanda stores broker metadata and logs on a managed-disk persistent volume.

### Deployment tier

- Images are built from FluidFramework source and pushed to ACR.
- The service runs on AKS.
- The validated reference exposes separate alfred, nexus, and historian LoadBalancer endpoints.
- The validated path uses HTTP and development token issuance.

### Important topology boundary

The Redpanda deployment has one broker replica and replication factor 1. Its persistent volume protects against loss of topic configuration from ordinary pod rescheduling or restart; it does not provide broker failover or high availability. Message-log integrity across restart was not separately validated.

## 4. Why full Routerlicious with Redpanda was selected

Four service shapes were evaluated with the Fluid client end-to-end suite: stock Kafka and ZooKeeper, full Routerlicious with Redpanda, a slim single-process Routerlicious assembly, and Tinylicious.

The Redpanda shape was selected because it:

- Preserves the full Routerlicious service topology and mainline application path.
- Uses the existing Kafka protocol integration without application-code changes.
- Removes ZooKeeper and reduces the broker tier from two services to one.
- Retains a path to broker persistence and horizontal application-tier scaling.
- Avoids making a custom slim or development-server topology the default operational handoff.

The measurements were comparative observations from one development environment, not production capacity claims. Slim and Tinylicious remain useful development or prototype alternatives, but they are not the recommended deployment baseline from this project. See [VALIDATION.md](./VALIDATION.md) for the exact evidence boundary.

## 5. Validation evidence matrix

The following results were recorded by the project before this handoff. They are not load, security, or availability certification.

| Capability | Recorded evidence | Boundary |
| --- | --- | --- |
| Local service startup | Source-built Docker stack reached service health endpoints | Health checks alone are not client E2E |
| Client connection | A real Fluid client connected to Azure-hosted alfred, nexus, and historian | HTTP and development token path |
| Document lifecycle | Client created and attached a document | No production authorization policy |
| Real-time collaboration | Operations synchronized between clients over the nexus WebSocket path | No WAN latency or scale characterization |
| Cold-load and convergence | A second client loaded the existing document and converged to the same state | Incremental-summary issue remains open |
| Presence | Both clients appeared in the audience | No large-audience test |
| Snapshot persistence | gitrest snapshots used an Azure Files persistent volume | Adapters for Azure Blob or other customer-selected backends were not implemented |
| Broker restart persistence | Both topics and their partition/replication settings remained after a pod restart with the PVC | Message-log integrity was not separately checked; single node; no failover test |
| Migration concept | A read-only freeze and latest-state recreation path was exercised from a hosted Fluid service to self-host | Latest state only; no op-history or seamless cutover guarantee |

## 6. Build and deployment decisions

### Build from source

The published server images tested during the project did not match the Routerlicious topology and health routes used by the deployment. The working path builds routerlicious, historian, and gitrest from FluidFramework source with Docker buildx and the required named repository-root build context, then pushes the images to ACR.

For a production handoff, the team must pin:

- A reviewed FluidFramework commit or release tag.
- All source modifications required by the image build.
- Immutable image tags or digests.
- Redis, MongoDB, Redpanda, and proxy image versions.

Building from a moving `main` branch is not a reproducible release strategy.

### Explicit broker topics

The Azure path explicitly creates and verifies `rawdeltas` and `deltas` with eight partitions and replication factor 1 before Routerlicious starts. The chart-rendered rdkafka settings request 32 partitions and replication factor 3 for a missing topic, which a single-node broker cannot satisfy; pre-creation establishes the validated 8/RF1 configuration.

### Persistent broker storage

An `emptyDir` broker volume lost topics when the pod was rescheduled after an AKS stop/start. The delivered [Redpanda manifest](./azure/redpanda.yaml) uses a managed-disk PVC and pod security context with UID/GID 101 so Redpanda can write the mounted volume.

### Snapshot storage

OSS gitrest exposes a pluggable snapshot-storage seam through `IFileSystemManager`, but it does not include an Azure Blob implementation. Azure Files is the zero-code filesystem option used by this reference deployment. Azure Blob is the default bring-your-own-storage example; a customer can connect another preferred backend through a compatible implementation. Any new adapter requires its own correctness, concurrency, recovery, backup/restore, and lifecycle validation.

## 7. What the project proves

Within the recorded test boundary, the project proves that:

1. Full Routerlicious can be packaged and run as a self-hosted service.
2. Redpanda can provide the Kafka protocol expected by Routerlicious without application-code changes.
3. A real Fluid client can collaborate through an Azure-hosted self-host deployment.
4. Document metadata, operations, and snapshots can be placed on persistent infrastructure controlled by the operator.
5. In the recorded AKS stop/start scenario, ephemeral broker storage lost both topics and caused client reconnect failure; message-log integrity was not separately validated.
6. A documented implementation and troubleshooting path can be handed to an infrastructure team for productionization.

## 8. Known limitations

### Security

- Public endpoints use HTTP rather than HTTPS/WSS.
- The validated client uses `InsecureTokenProvider`.
- The [token Azure Function](./token-function/README.md) is an unfinished prototype.
- The tenant signing key is passed as a Helm value in the reference flow, which can expose it in Helm metadata and shell history.
- The current Helm chart renders tenant and service signing keys into a ConfigMap, so ConfigMap readers can recover them.
- The in-cluster Redis configuration has no authentication.
- The in-cluster MongoDB configuration has no authentication, TLS, or NetworkPolicy isolation.
- The reference image-pull flow uses an ACR admin password stored in a Kubernetes secret.

### Reliability and scale

- Redpanda is single-node with replication factor 1.
- MongoDB and Redis are single in-cluster instances.
- Application services use one replica in the delivered values.
- No failover, zone-loss, capacity, soak, or disaster-recovery test was completed.
- No production SLO, alerting, or on-call model was defined.

### Summarization

An incremental-summary upload returned `404 Summary tree handle object not found` in the Azure client exercise. Live operations, cold-load, convergence, and presence continued to work, but incremental summaries did not advance in that observation. Whole-summary configuration must be aligned and long-running documents revalidated; otherwise operation logs may continue growing.

### Storage and lifecycle

- Snapshots use Azure Files; adapters for Azure Blob and other customer-selected backends were not delivered.
- The operator must decide whether storage created with the AKS deployment can remain under the cluster-managed resource lifecycle or must move to a separately managed storage boundary.
- Backup and restore procedures were not implemented or tested.

### Migration

The exercised migration concept freezes source writes, reads the latest collaborative state, recreates it on the self-hosted service, and cuts clients over. It does not preserve operation history, guarantee the same document identifier, or provide a seamless live migration.

## 9. Productionization decision register

The receiving team should assign one accountable owner to every row before production use.

| Decision | Required outcome | Suggested acceptance criteria |
| --- | --- | --- |
| TLS and DNS ownership | Owned HTTPS/WSS endpoints and certificate lifecycle | Valid certificate, renewal test, HTTP disabled or redirected, client E2E over TLS |
| Production token service | Trusted identity and authorization boundary | Anonymous/dev token path disabled; user, tenant, and document authorization tested |
| Tenant-key management | Server-side storage, access policy, and rotation | Key absent from source, shell history, and Helm values; rotation exercise completed |
| Incremental summaries | Correct summary upload and bounded op growth | Repeated summaries succeed; long-running and restart cold-load tests pass |
| Redpanda topology | Durable and failure-tolerant broker choice | Replicated deployment or managed service; node-loss and recovery tests pass |
| MongoDB topology | Supported durable metadata/ops store | Authentication, backups, restore, failover, and compatibility tests pass |
| Redis topology | Supported resilient cache/pub-sub service | Authentication/TLS where applicable; restart and failover behavior tested |
| Snapshot storage | Accept Azure Files or provide an `IFileSystemManager` implementation for the customer's preferred backend | Concurrency, durability, backup, restore, and lifecycle ownership documented |
| Storage placement | Stable resource ownership independent of accidental cluster cleanup | Named owner, retention policy, locks, backup policy, and teardown test |
| Observability and SLO | Operable service boundary | Metrics, dashboards, alerts, logs, runbooks, escalation owner, and SLO approved |
| Release and security updates | Reproducible build and upgrade process | Pinned source and images; staged upgrade and rollback exercise completed |
| Migration | Customer-specific cutover contract | Export availability, downtime window, ID mapping, validation, and rollback agreed |

## 10. Operator handoff

Use the repository documents by purpose:

- [README.md](./README.md): status, recommendation, deployment entry points, and complete repository map.
- [AGENTS.md](./AGENTS.md): deterministic local and Azure execution gates.
- [ARCHITECTURE.md](./ARCHITECTURE.md): service topology and evaluated slim alternative.
- [VALIDATION.md](./VALIDATION.md): recorded evidence, provenance, failures, and tests not run.
- [azure/README.md](./azure/README.md): phase-by-phase AKS runbook and hardening register.
- [token-function/README.md](./token-function/README.md): unfinished auth prototype and production requirements.

Operators must follow each VERIFY gate and stop when a gate fails. A health response does not replace the two-client collaboration validation.

## 11. Production-use boundary

Full Routerlicious with Redpanda is the reference baseline delivered by this repository. Production adoption requires an explicitly accepted broker topology and recovery model, a supported storage contract, and owned release and operating processes.

Security, summarization, high availability, storage lifecycle, observability, and migration must meet the acceptance criteria in this handoff before the service carries production traffic.