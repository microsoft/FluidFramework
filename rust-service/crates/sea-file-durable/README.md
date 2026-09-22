# Sea Durable File

The durable backend now lives in [`sea-file`](../sea-file/README.md) as `sea_file::DurableStorage`.
The former `sea-file-durable` crate is retired.

## Power-Loss Model

See the consolidated [power-loss model](../sea-file/README.md#power-loss-model) for the unchanged filesystem and device assumptions.
See the [execution and cancellation contract](../sea-file/README.md#cancellation-and-failures) for bounded admission, flush, and shutdown.