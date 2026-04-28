/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IRuntimeMessagesContent,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";

import type {
	ContainerMessageType,
	InboundSequencedContainerRuntimeMessage,
	LocalContainerRuntimeMessage,
} from "./messageTypes.js";
import type { IRuntimeFeature } from "./runtimeFeature.js";

/**
 * Collection of {@link IRuntimeFeature}s. Lifecycle hooks fan out to every
 * member; op-routing hooks (handleOp / applyStashedOp / reSubmitOp /
 * rollbackStagedOp) dispatch via a single
 * `Map<ContainerMessageType, IRuntimeFeature>` built at registration time.
 * Each op type has at most one owning feature.
 *
 * @internal
 */
export class RuntimeFeatureCollection {
	private readonly features: IRuntimeFeature[] = [];

	private readonly opOwners = new Map<ContainerMessageType, IRuntimeFeature>();

	/**
	 * Append a feature and return it, so callers can chain registration with
	 * assignment: `this.foo = this.features.add(new FooFeature(...))`.
	 *
	 * Order matters for fan-out hooks (lifecycle, summary). Op-routing
	 * dispatch is type-keyed and order-independent.
	 *
	 * Throws if the feature claims an op type already claimed by another feature.
	 */
	public add<T extends IRuntimeFeature>(feature: T): T {
		this.features.push(feature);
		this.registerOpClaims(feature);
		return feature;
	}

	/**
	 * Replace `oldFeature` (by reference) with `replacement`, preserving
	 * registration order. Returns `replacement`. If `oldFeature` isn't
	 * present, appends `replacement` instead.
	 *
	 * Primarily a test-fixture seam — production code should rarely need this.
	 */
	public replace<T extends IRuntimeFeature>(oldFeature: IRuntimeFeature, replacement: T): T {
		const index = this.features.indexOf(oldFeature);
		if (index >= 0) {
			this.features[index] = replacement;
			for (const [type, owner] of this.opOwners) {
				if (owner === oldFeature) {
					this.opOwners.delete(type);
				}
			}
		} else {
			this.features.push(replacement);
		}
		this.registerOpClaims(replacement);
		return replacement;
	}

	private registerOpClaims(feature: IRuntimeFeature): void {
		if (feature.supportedOps === undefined) {
			return;
		}
		for (const type of feature.supportedOps) {
			const existing = this.opOwners.get(type);
			if (existing !== undefined && existing !== feature) {
				throw new Error(`RuntimeFeatureCollection: multiple features claim ${type}`);
			}
			this.opOwners.set(type, feature);
		}
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

	public setConnectionState(canSendOps: boolean, clientId: string | undefined): void {
		for (const f of this.features) {
			f.setConnectionState?.(canSendOps, clientId);
		}
	}

	public notifyStagingMode(active: boolean): void {
		for (const f of this.features) {
			f.notifyStagingMode?.(active);
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

	/**
	 * Route an inbound message to the feature that claims its type, if any.
	 * Returns `true` if a feature handled it.
	 */
	public handleOp(
		message: Omit<InboundSequencedContainerRuntimeMessage, "contents">,
		messagesContent: IRuntimeMessagesContent[],
		local: boolean,
		savedOp?: boolean,
	): boolean {
		const feature = this.opOwners.get(message.type as ContainerMessageType);
		if (feature?.handleOp === undefined) {
			return false;
		}
		feature.handleOp(message, messagesContent, local, savedOp);
		return true;
	}

	/**
	 * Dispatch a stashed op to the feature that claims its type, returning
	 * the result wrapper, or `undefined` if no feature claims the type.
	 */
	public async applyStashedOp(
		opContents: LocalContainerRuntimeMessage,
	): Promise<{ result: unknown } | undefined> {
		const feature = this.opOwners.get(opContents.type as ContainerMessageType);
		if (feature?.applyStashedOp === undefined) {
			return undefined;
		}
		return feature.applyStashedOp(opContents);
	}

	public reSubmitOp(
		message: LocalContainerRuntimeMessage,
		localOpMetadata: unknown,
		opMetadata: unknown,
		squash: boolean,
	): boolean {
		const feature = this.opOwners.get(message.type as ContainerMessageType);
		if (feature?.reSubmitOp === undefined) {
			return false;
		}
		feature.reSubmitOp(message, localOpMetadata, opMetadata, squash);
		return true;
	}

	public rollbackStagedOp(
		message: LocalContainerRuntimeMessage,
		localOpMetadata: unknown,
	): boolean {
		const feature = this.opOwners.get(message.type as ContainerMessageType);
		if (feature?.rollbackStagedOp === undefined) {
			return false;
		}
		feature.rollbackStagedOp(message, localOpMetadata);
		return true;
	}
}
