/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Fluid driver and transport-neutral client contracts for the Sea service.
 *
 * @packageDocumentation
 */

export {
	SeaDeltaConnection,
	SeaDeltaStorage,
	SeaDocumentService,
	SeaDriver,
	SeaDocumentStorage,
	type MinimalWasmDriverOptions,
	type WasmClientFactory,
} from "./fluidDriver.js";
export type { PendingSubmission } from "./delta.js";
export { createSeaServiceClient, type SeaServiceOptions } from "./serviceClient.js";
export {
	SeaSessionDriverClient,
	type SeaSessionFactory,
	type SeaSnapshotParticipation,
} from "./sessionClient.js";
export { Events, type DeltaConnectionLifecycle, type Listener } from "./lifecycleHelpers.js";
export type {
	BlobUpload,
	ProjectedOperation,
	ProjectedOperationSubscription,
	ProjectedReadPage,
	SeaDriverClient,
	SubmissionResolution,
	SummaryEntry,
	SummaryPublication,
} from "./wasmClient.js";
