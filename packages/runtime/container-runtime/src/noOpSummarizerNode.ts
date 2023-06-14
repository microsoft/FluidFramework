/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	ISummarizeResult,
	CreateChildSummarizerNodeParam,
	SummarizeInternalFn,
	ITelemetryContext,
	ISummarizerNodeWithGC,
	IGarbageCollectionData,
	ISummarizerNodeConfigWithGC,
} from "@fluidframework/runtime-definitions";
import { ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";

export class NoOpSummarizerNodeWithGc implements ISummarizerNodeWithGC {
	public get referenceSequenceNumber() {
		return 0;
	}

	protected readonly children = new Map<string, NoOpSummarizerNodeWithGc>();

	// Set used routes to have self route by default. This makes the node referenced by default. This is done to ensure
	// that this node is not marked as collected when running GC has been disabled. Once, the option to disable GC is
	// removed (from runGC flag in IContainerRuntimeOptions), this should be changed to be have no routes by default.
	private usedRoutes: string[] = [""];

	public constructor(
		private readonly summarizeInternalFn: SummarizeInternalFn,
		private readonly getGCDataFn?: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
		protected telemetryNodeId?: string,
	) {}

	public async summarize(
		fullTree: boolean,
		trackState: boolean = true,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummarizeResult> {
		return this.summarizeInternalFn(fullTree, trackState, telemetryContext);
	}

	public async getGCData(fullGC: boolean = false): Promise<IGarbageCollectionData> {
		assert(
			this.getGCDataFn !== undefined,
			0x1b3 /* "GC data cannot be retrieved without getGCDataFn" */,
		);
		return this.getGCDataFn(fullGC);
	}

	public updateBaseSummaryState(snapshot: ISnapshotTree) {}

	public recordChange(op: ISequencedDocumentMessage): void {}

	public invalidate(sequenceNumber: number): void {}

	public createChild(
		summarizeInternalFn: SummarizeInternalFn,
		id: string,
		createParam: CreateChildSummarizerNodeParam,
		config?: ISummarizerNodeConfigWithGC,
		getGCDataFn?: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
	): ISummarizerNodeWithGC {
		assert(!this.children.has(id), 0x1ab /* "Create SummarizerNode child already exists" */);
		const child = new NoOpSummarizerNodeWithGc(summarizeInternalFn, getGCDataFn, id);
		this.children.set(id, child);
		return child;
	}

	public getChild(id: string): ISummarizerNodeWithGC | undefined {
		return this.children.get(id);
	}

	public deleteChild(id: string): void {
		this.children.delete(id);
	}

	public isReferenced(): boolean {
		return this.usedRoutes.includes("") || this.usedRoutes.includes("/");
	}

	public updateUsedRoutes(usedRoutes: string[]) {
		this.usedRoutes = Array.from(usedRoutes);
	}

	public isSummaryInProgress(): boolean {
		return false;
	}
}
