/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IFluidCodeDetails,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import type { ISummaryGenerationContext } from "@fluidframework/container-runtime/internal";
import type {
	ISnapshotTree,
	ISummaryContext,
} from "@fluidframework/driver-definitions/internal";

/** Lifecycle instrumentation supplied to an application's test adapter, not an application model API. */
export interface ISeedWorkflowRuntimeOptions<TObservation> {
	/** Disable seed conversion to exercise ordinary native reload. */
	readonly allowProjection: boolean;
	/** Record an application-defined load observation without interpreting its model or schema. */
	readonly observe: (observation: TObservation) => void;
	/** Record the checkpoint and optionally fail a projection before its output can be uploaded. */
	readonly beforeProjection: (checkpoint: number) => void;
	/** Record the runtime's effective summary policy. */
	readonly observeSummary: (context: ISummaryGenerationContext) => void;
	/** Notify the harness after native and application reuse state adopt the tracked ACK. */
	readonly onSummaryAccepted: (context: ISummaryContext) => void;
}

/**
 * Application boundary for the test lifecycle harness. Implement it beside an application's tests.
 * The harness owns loaders, synchronization, fault injection, and cleanup; the adapter owns the
 * runtime factory, seed layout, and typed observations. Editing and projection assertions stay with
 * the application's tests. This is a test contract, not a general DDS codec or a published SDK.
 */
export interface ISeedWorkflowApplication<TObservation> {
	/** Code identity stored by the application's external creator and registered with each loader. */
	readonly codeDetails: IFluidCodeDetails;
	/** Compose the application's real runtime with the requested lifecycle instrumentation. */
	createRuntimeFactory(options: ISeedWorkflowRuntimeOptions<TObservation>): IRuntimeFactory;
	/** Identify source dependencies to deny during offline restoration, without reading their bodies. */
	seedBlobIds(snapshot: ISnapshotTree | undefined): readonly string[];
}
