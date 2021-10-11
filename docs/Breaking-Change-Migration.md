# Summary and Op Breaking Change Migration

We describe here the general mechanism by which summaries and ops are updated to new breaking versions. This mechanism allows us to safely make breaking changes to summaries and ops within ongoing sessions without having to retain any old state in the new version of the ops.

Note: We haven't yet solved the question of whether such data loss is okay.

The migration mechanism depends on a staged rollout so we can be sure all clients have the new code. The staged rollout process is orthogonal and not described here.

## Detecting When an Update is Needed

The version of a `SharedTree` is dictated by its `writeSummaryFormat` field which stores a version of summaries that `SharedTree` supports writing. When a summary is loaded, `SharedTree` compares the version of the loaded summary with its version. If the loaded version is older, it is necessary to update the summary to match the `SharedTree` version.

To prepare for the update, an update op is sent out with the version to update to and the `SharedTree` version is set to the loaded version so that it knows how to handle summary writes before the update happens.

In every case, the loaded summary is structurally converted to the latest version before it is used to create the `EditLog`, which only supports reading the latest version. This means that the loaded data is not modified but it may be moved around to fit the structure of the latest format.

## How Summaries are Written Pending an Update

Pending an update, summaries are written in the older format. This is why the `SharedTree` version is set to the version of the loaded summary.

If a format version can be written, SharedTree is guaranteed to be able to structurally convert from the latest version to that version. This is typically the opposite operation done to update a summary before using it to create an `EditLog` and also does not modify any data.

## Receiving an Update Op

When an update op is received, we check to make sure the update is valid and hasn't already been completed due to concurrent upgrade attempts. If so, the update is processed.

To process an update, a summary is first taken in the old format version. An upgrade conversion is performed on that summary (including any data modifications that are deemed acceptable) and the resulting summary is then used to recreate objects that `SharedTree` is dependent on to store state including `EditLog`.

## Versioned Ops

Ops may include a version field; if they do not, it is assumed they have version 0.0.2. For ops that are not update ops, this is an indication of whether or not a client should process an op. Ops should only be processed by clients that have the same version. This prevents clients from processing ops that may have mismatched data if they have not yet been appropriately updated.

It is not necessary to store op versions or ignored ops in the history. This is because clients will only ever receive ops at the same versions as each other e.g. for edit v1 update v2 edit v1 edit v2, every client must have seen update v2 before seeing the second edit v1 so we know we can safely throw it away without any client deciding to process it instead. The version is only needed so that the client knows whether it can process the op or not. This isn't necessary to store in history since if it's in the history, we know it was processed correctly by a client with the same version. Once the summary is written, any edits in the history are ones that we know were valid. And when a summary is updated using this migration mechanism, these old edits are also updated to match the newest version so we won't end up in a situation where we have old edits in the history that can't be processed by the current client. However, because of history virtualization, this only applies when async summarization is supported to allow us to download old edits asynchronously and then update them. While async summarization is not supported, we are choosing to throw away history when updates to edits are needed.

Update ops are idempotent (meaning updates with the same version as the client are ignored).
