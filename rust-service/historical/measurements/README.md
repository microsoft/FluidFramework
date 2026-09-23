# Measurement Evidence

These dated datasets support the [project overview](../PROJECT_OVERVIEW.md), not a performance claim about the current checkout.
The overview records the tested revisions, workloads, environment, and comparison limits.

| Dataset | Purpose |
| --- | --- |
| [Session resource policy checkpoint 1](session-resource-policy-checkpoint1-20260923.json.gz) | Experimental cache provenance, surviving measurements, validation, and explicit performance/missing-data exceptions; see the [cumulative report](../../SESSION_RESOURCE_POLICY_IMPLEMENTATION_REPORT.md). |
| [Summary and storage comparison](summary-storage-20260922/README.md) | Full/incremental Fluid summaries, verified restart loads, and actual file-backend sizes. |
| [Service refresh](refresh-92ecf30/README.md) | Repeated service loads, matched-load resources, and storage probes at `92ecf30f4a7`. |
| [Paired browser comparison](browser-dds-comparison/README.md) | Dummy DDS and real SharedTree, including the WebSocketStream supplement. |
| [LevelDB follow-up](tinylicious-leveldb-fixed/README.md) | Tinylicious disk measurements after its adapter repair. |
| [Blocked LevelDB attempts](tinylicious-leveldb/README.md) | The pre-load compatibility failures that explain the repair. |

Read the unsuccessful outcomes and guarantee differences as well as the passing samples.
The datasets are not comparable capacity maxima, and old revisions must not be pooled with later implementations.
Recorded commands and source-status fields retain the collection-time paths; those paths are provenance, not current output locations.
Use the [current collection scripts](../../scripts/README.md) for new experiments and write exploratory output outside the repository.