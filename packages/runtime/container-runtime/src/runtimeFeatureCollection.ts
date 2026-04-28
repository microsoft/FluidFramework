/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";

import type { IRuntimeFeature } from "./runtimeFeature.js";

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

	/**
	 * Replace `oldFeature` (by reference) with `replacement`, preserving the
	 * registration order. Returns `replacement`. If `oldFeature` isn't present,
	 * appends `replacement` instead.
	 *
	 * Primarily a test-fixture seam — production code should rarely need this.
	 */
	public replace<T extends IRuntimeFeature>(oldFeature: IRuntimeFeature, replacement: T): T {
		const index = this.features.indexOf(oldFeature);
		if (index >= 0) {
			this.features[index] = replacement;
		} else {
			this.features.push(replacement);
		}
		return replacement;
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

	public onStagingModeChange(active: boolean): void {
		for (const f of this.features) {
			f.onStagingModeChange?.(active);
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

	public handleOp(
		message: unknown,
		messagesContent: unknown[],
		local: boolean,
		savedOp?: boolean,
	): boolean {
		for (const f of this.features) {
			if (f.handleOp?.(message, messagesContent, local, savedOp) === true) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Dispatch a stashed op to features, returning the result wrapper from the
	 * first feature that claims it, or `undefined` if no feature does.
	 */
	public async applyStashedOp(opContents: unknown): Promise<{ result: unknown } | undefined> {
		for (const f of this.features) {
			const claim = await f.applyStashedOp?.(opContents);
			if (claim !== undefined) {
				return claim;
			}
		}
		return undefined;
	}

	public reSubmitOp(
		message: unknown,
		localOpMetadata: unknown,
		opMetadata: unknown,
		squash: boolean,
	): boolean {
		for (const f of this.features) {
			if (f.reSubmitOp?.(message, localOpMetadata, opMetadata, squash) === true) {
				return true;
			}
		}
		return false;
	}

	public rollbackStagedOp(message: unknown, localOpMetadata: unknown): boolean {
		for (const f of this.features) {
			if (f.rollbackStagedOp?.(message, localOpMetadata) === true) {
				return true;
			}
		}
		return false;
	}
}
