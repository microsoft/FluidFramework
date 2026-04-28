/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRuntimeFeature } from "@fluidframework/runtime-definitions/internal";

import type { IGarbageCollector } from "./gcDefinitions.js";

/**
 * Adapts an {@link IGarbageCollector} to {@link IRuntimeFeature} so the runtime
 * can drive GC's lifecycle through the feature collection.
 *
 * @remarks
 * This is a thin lifecycle wrapper. The underlying `IGarbageCollector` is still
 * accessed directly by the runtime for non-lifecycle operations (node-update
 * notifications, summary contribution, GC data queries, etc.). Migrating those
 * to the feature interface is a separate step — would require additions like
 * `contributeSummary`, `contributeMetadata`, and node-activity observation
 * hooks.
 *
 * @internal
 */
export class GarbageCollectionSubsystem implements IRuntimeFeature {
	public constructor(private readonly gc: IGarbageCollector) {}

	public async onLoadFromSnapshot(): Promise<void> {
		await this.gc.initializeBaseState();
	}

	public onConnectionStateChange(canSendOps: boolean, clientId: string | undefined): void {
		this.gc.setConnectionState(canSendOps, clientId);
	}

	public dispose(): void {
		this.gc.dispose();
	}
}
