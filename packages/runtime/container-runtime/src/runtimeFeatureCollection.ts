/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IRuntimeFeature,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";

/**
 * Collection of {@link IRuntimeFeature}s, dispatching lifecycle calls to each
 * member in registration order.
 *
 * @remarks
 * Implements `Required<IRuntimeFeature>` — every method is present at the
 * collection level even though individual features may omit any. The
 * runtime calls these collection methods directly; it does not iterate
 * features itself.
 *
 * Composite pattern: the collection IS itself a feature in shape, but rather
 * than implementing each method's behavior it fans out to its members.
 *
 * @internal
 */
export class RuntimeFeatureCollection implements Required<IRuntimeFeature> {
	private readonly features: IRuntimeFeature[] = [];

	/**
	 * Append a feature and return it, so callers can chain registration with
	 * assignment: `this.foo = this.features.add(new FooFeature(...))`.
	 *
	 * Order matters — earlier-added features run first.
	 */
	public add<T extends IRuntimeFeature>(feature: T): T {
		this.features.push(feature);
		return feature;
	}

	public async onLoadFromSnapshot(): Promise<void> {
		for (const f of this.features) {
			await f.onLoadFromSnapshot?.();
		}
	}

	public async onApplyStashedOps(seqNum: number): Promise<void> {
		for (const f of this.features) {
			await f.onApplyStashedOps?.(seqNum);
		}
	}

	public async onReady(): Promise<void> {
		for (const f of this.features) {
			await f.onReady?.();
		}
	}

	public onConnectionStateChange(canSendOps: boolean, clientId: string | undefined): void {
		for (const f of this.features) {
			f.onConnectionStateChange?.(canSendOps, clientId);
		}
	}

	public dispose(): void {
		for (const f of this.features) {
			f.dispose?.();
		}
	}

	public contributeSummary(
		summaryTree: ISummaryTreeWithStats,
		fullTree: boolean,
		trackState: boolean,
		telemetryContext?: ITelemetryContext,
	): void {
		for (const f of this.features) {
			f.contributeSummary?.(summaryTree, fullTree, trackState, telemetryContext);
		}
	}
}
