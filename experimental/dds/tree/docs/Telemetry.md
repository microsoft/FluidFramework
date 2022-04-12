# SharedTree Telemetry

The following are telemetry events that are logged in the `shared-tree` package and their descriptions:

## BecameOldestClient

The client has become the oldest client in the quorum.

## NoOpSent

A NoOp operation has been sent to add a client to the quorum.

## SummaryCreation

This is a performance event where each `SummaryCreationStart` has a corresponding `SummaryCreationEnd` event that contains additional information, or a `SummaryCreationFailure` event with additional error information.

-   **SummaryCreationStart**: Starting the creation of a new summary.
-   **SummaryCreationEnd**: Finished creating a new summary. This is a performance event that includes the duration of time it took to complete creating a new summary. Also includes statistics on the summary created which consists of history size, number of chunks, number of uploaded chunks, and format version.
-   **SummaryCreationFailure**: Creation of a new summary failed.

## SummaryConversion

Converting old summary to new read format version.

## SummaryLoad

This is a performance event where each `SummaryLoadStart` has a corresponding `SummaryLoadEnd` event that contains additional information, or a `SummaryLoadFailure` event with additional error information.

-   **SummaryLoadStart**: Started loading a summary.
-   **SummaryLoadEnd**: Finished loading a summary. This is a performance event that includes the duration of time it took to complete the summary load. Also includes statistics on the summary loaded which consists of history size, number of chunks, number of uploaded chunks, and format version.
-   **SummaryLoadFailure**: Failed to load a summary.

## CatchUpBlobUpload

Successfully uploaded a catch up blob.

## EditChunkUpload

Successfully uploaded an edit chunk blob that is not a catch up blob.

## EditChunkUploadFailure

Failed to upload an edit chunk blob.
