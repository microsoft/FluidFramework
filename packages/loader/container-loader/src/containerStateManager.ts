/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { IGetPendingLocalStateProps, IRuntime } from "@fluidframework/container-definitions";
import {
	ITelemetryLoggerExt,
	MonitoringContext,
	PerformanceEvent,
	UsageError,
	createChildMonitoringContext,
} from "@fluidframework/telemetry-utils";
import { assert } from "@fluidframework/core-utils";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { ISerializableBlobContents } from "./containerStorageAdapter";
import { IPendingContainerState } from "./container";

export class containerStateManager {
	private readonly savedOps: ISequencedDocumentMessage[] = [];
	public snapshot:
		| {
				tree: ISnapshotTree;
				blobs: ISerializableBlobContents;
		  }
		| undefined;
	private readonly mc: MonitoringContext;
	private readonly clientId: string | undefined;
	private readonly offlineLoadEnabled: boolean;
	private resolvedUrl: IResolvedUrl | undefined;
	private runtime: IRuntime | undefined;

	constructor(subLogger: ITelemetryLoggerExt, clientId, offlineLoadEnabled) {
		this.clientId = clientId;
		this.offlineLoadEnabled = offlineLoadEnabled;
		this.mc = createChildMonitoringContext({
			logger: subLogger,
			namespace: "ContainerStateManager",
		});
	}

	public addSavedOp(message: ISequencedDocumentMessage) {
		this.savedOps.push(message);
	}

	public getSavedOps() {
		return this.savedOps;
	}

	public setLoadedAttributes(
		snapshot:
			| {
					tree: ISnapshotTree;
					blobs: ISerializableBlobContents;
			  }
			| undefined,
		resolvedUrl,
		runtime,
	) {
		this.snapshot = snapshot;
		this.resolvedUrl = resolvedUrl;
		this.runtime = runtime;
	}

	public async getPendingLocalStateCore(props: IGetPendingLocalStateProps) {
		return PerformanceEvent.timedExecAsync(
			this.mc.logger,
			{
				eventName: "getPendingLocalState",
				notifyImminentClosure: props.notifyImminentClosure,
				savedOpsSize: this.getSavedOps().length,
				clientId: this.clientId,
			},
			async () => {
				if (!this.offlineLoadEnabled) {
					throw new UsageError(
						"Can't get pending local state unless offline load is enabled",
					);
				}
				assert(
					this.resolvedUrl !== undefined && this.resolvedUrl.type === "fluid",
					0x0d2 /* "resolved url should be valid Fluid url" */,
				);
				assert(this.snapshot !== undefined, 0x5d5 /* no base data */);
				const pendingRuntimeState = await this.runtime?.getPendingLocalState(props);
				const pendingState: IPendingContainerState = {
					pendingRuntimeState,
					baseSnapshot: this.snapshot.tree,
					snapshotBlobs: this.snapshot.blobs,
					savedOps: this.getSavedOps(),
					url: this.resolvedUrl.url,
					// no need to save this if there is no pending runtime state
					clientId: pendingRuntimeState !== undefined ? this.clientId : undefined,
				};

				return JSON.stringify(pendingState);
			},
		);
	}
}
