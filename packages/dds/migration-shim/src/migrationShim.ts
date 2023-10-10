/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	type IEvent,
	type IFluidHandle,
	type IFluidLoadable,
} from "@fluidframework/core-interfaces";
import {
	type IChannelAttributes,
	type IChannel,
	type IChannelServices,
	type IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import {
	type IExperimentalIncrementalSummaryContext,
	type IGarbageCollectionData,
	type ITelemetryContext,
	type ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions";
import {
	type SharedTreeFactory as LegacySharedTreeFactory,
	type SharedTree as LegacySharedTree,
} from "@fluid-experimental/tree";
import { type SharedTreeFactory, type ISharedTree } from "@fluid-experimental/tree2";
import { assert } from "@fluidframework/core-utils";
/**
 * Interface for migration events.
 */
export interface IMigrationEvent extends IEvent {
	/**
	 * Event that is emitted when the migration is complete.
	 */
	(event: "migrated", listener: () => void);
}

/**
 * Interface for migration operation.
 */
export interface IMigrationOp {
	/**
	 * Type of the migration operation.
	 */
	type: "hotSwap";
	/**
	 * Old channel attributes.
	 */
	oldAttributes: IChannelAttributes;
	/**
	 * New channel attributes.
	 */
	newAttributes: IChannelAttributes;
}

/**
 * Create skeleton Migration Shim that can hot swap from one DDS to a new DDS.
 */
export class MigrationShim extends TypedEventEmitter<IMigrationEvent> implements IChannel {
	public constructor(
		public readonly id: string,
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly oldFactory: LegacySharedTreeFactory, // Should this be a legacy shared tree factory only?
		private readonly newFactory: SharedTreeFactory, // Should this be a new shared tree factory only?
		private readonly populateNewSharedObjectFn: (
			oldSharedObject: LegacySharedTree,
			newSharedObject: ISharedTree,
		) => void,
	) {
		super();
	}

	private _oldTree: LegacySharedTree | undefined;
	private get oldTree(): LegacySharedTree {
		assert(this._oldTree !== undefined, "Old tree not initialized");
		return this._oldTree;
	}

	// This is the magic button that tells this Spanner and all other Spanners to swap to the new Shared Object.
	public submitMigrateOp(): void {
		// These console logs are for compilation purposes
		console.log(this.runtime);
		console.log(this.oldFactory);
		console.log(this.newFactory);
		console.log(this.populateNewSharedObjectFn);
		throw new Error("Method not implemented.");
	}

	public get target(): LegacySharedTree | ISharedTree {
		return this.oldTree;
	}

	public async load(services: IChannelServices): Promise<void> {
		this._oldTree = (await this.oldFactory.load(
			this.runtime,
			this.id,
			services,
			this.oldFactory.attributes,
		)) as LegacySharedTree;
	}
	public create(): void {
		this._oldTree = this.oldFactory.create(this.runtime, this.id);
	}

	public attributes!: IChannelAttributes;
	public getAttachSummary(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
	): ISummaryTreeWithStats {
		throw new Error("Method not implemented.");
	}
	public async summarize(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined,
	): Promise<ISummaryTreeWithStats> {
		throw new Error("Method not implemented.");
	}
	public isAttached(): boolean {
		throw new Error("Method not implemented.");
	}
	public connect(services: IChannelServices): void {
		throw new Error("Method not implemented.");
	}
	public getGCData(fullGC?: boolean | undefined): IGarbageCollectionData {
		throw new Error("Method not implemented.");
	}
	public handle!: IFluidHandle;
	public IFluidLoadable!: IFluidLoadable;
}
