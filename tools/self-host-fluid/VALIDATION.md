# Validation record

This file records the evidence used to scope this repository. It is not a production certification, capacity benchmark, or current CI result.

## Evidence boundary

- **Local full-suite record:** 2026-07-06.
- **Azure real-client record:** 2026-07-10.
- **FluidFramework base revision in the validation checkout:** `00d8102b63651592f457a990a77c954b20417935`.
- **Repository revision before this documentation closeout:** `5252f9d067ee037da23d7c6d952861628773507e`.

The FluidFramework validation checkout also contained local build and experiment changes. Exact image digests and a clean source patch set were not archived. Therefore, the revision above is provenance, not a claim that checking out that commit alone reproduces every recorded result. A production release must pin and archive the complete source patch set and immutable image digests.

No tests in this file were rerun as part of the 2026-07-13 documentation closeout.

## Local service-shape comparison

The same Fluid client end-to-end suite was recorded against four service shapes with `--compatKind=None`:

| Shape | Recorded result | Runtime |
| --- | --- | ---: |
| Kafka + ZooKeeper | 634 pass / 6 fail / 492 skip | 328 s |
| Full Routerlicious + Redpanda | 634 pass / 6 fail / 492 skip | 346 s |
| Slim single-process assembly | 634 pass / 6 fail / 492 skip | 189 s |
| Tinylicious | 658 pass | 149 s |

The six failures in the first three rows were recorded as old-version compatibility cases outside the selected `compatKind=None` purpose. The measurements came from one development environment and must not be interpreted as production capacity or SLA data.

The broker resource observations in the main README are likewise comparative measurements from that environment, not guaranteed sizing values.

The retained project record reports the following observations: Kafka + ZooKeeper broker
average CPU 62%, peak CPU 333%, and approximately 634 MiB memory; Redpanda average CPU 4.9%,
peak CPU 10%, and approximately 289 MiB memory. The original host specification, Docker/OS
versions, sampling command and interval, warm-up policy, run count, aggregation method, and raw
resource log were not archived in this repository. The derived ratios are therefore evidence
of the recorded engineering comparison, not a reproducible benchmark or production sizing input.

## Azure reference deployment

The recorded Azure topology was:

- Source-built routerlicious, historian, and gitrest images stored in ACR.
- Full Routerlicious application tier on AKS.
- Single-node Redpanda with explicit `rawdeltas` and `deltas` topics.
- In-cluster MongoDB and Redis.
- historian/gitrest snapshots on an Azure Files persistent volume.
- Separate public alfred, nexus, and historian endpoints.
- HTTP and `InsecureTokenProvider` for the client exercise.

A real Fluid client running locally recorded the following behavior against the Azure-hosted services:

1. Connected to alfred, nexus, and historian.
2. Created and attached a document.
3. Exchanged real-time operations over the nexus WebSocket path.
4. Loaded the existing document in a second client.
5. Converged both clients to the same state.
6. Reported both clients in the audience.

Live endpoint addresses, tenant keys, cloud subscription identifiers, resource-group names, and cluster names are intentionally not stored in this repository.

## Broker persistence recovery

An earlier Azure Redpanda deployment used `emptyDir`. After an AKS stop/start rescheduled the pod, both delta topics were missing and clients entered a reconnect loop with `Unable to allocate topic with given replication factor`.

The delivered manifest replaces `emptyDir` with a managed-disk PVC and sets `fsGroup`, `runAsUser`, and `runAsGroup` to 101. The recorded recovery check restarted the Redpanda deployment and observed both topics retained with eight partitions and replication factor 1.

This proves restart persistence for the recorded single-node scenario. It does not prove high availability, node-loss tolerance, quorum recovery, or zero-downtime failover.

## Latest-state migration concept

The project record dated 2026-07-08 describes a manual migration exercise from a hosted Fluid
service to self-host: issue read-only `[DocRead]` source tokens, confirm writes are rejected
server-side, read the latest
state through a Fluid client, recreate that state in the self-host deployment, and confirm the
destination remains writable while the source remains frozen.

The prototype scripts used for that exercise were untracked files in the FluidFramework
validation checkout and are not delivered in this repository. The result supports the bounded
latest-state cutover concept; it is not a repeatable migration tool, does not preserve operation
history, does not guarantee the same document identifier, and does not prove seamless live
migration or production identity integration.

## Known failed or incomplete behavior

- An incremental-summary upload returned `404 Summary tree handle object not found` in one Azure client exercise. Live collaboration continued, but summary advancement and long-running op growth remain unresolved.
- Production token issuance was not validated. The exercised path used `InsecureTokenProvider`.
- TLS, custom DNS, multiple replicas, managed MongoDB/Redis, backup/restore, monitoring, load, soak, failover, and disaster recovery were not validated.
- The token Azure Function is an unfinished prototype.

## Repeatable review gates

Before treating a new deployment as equivalent evidence, record and retain:

1. The exact FluidFramework commit and complete patch set.
2. Immutable image tags or digests.
3. Kubernetes and Helm values with secrets removed.
4. Topic partition and replication configuration.
5. Service and PVC state.
6. Health responses for alfred and historian and the nexus socket.io handshake.
7. A two-client create, real-time sync, cold-load, convergence, and audience run.
8. A broker restart persistence check.
9. Summary progression over a long-running document.
10. The explicit list of tests not run.