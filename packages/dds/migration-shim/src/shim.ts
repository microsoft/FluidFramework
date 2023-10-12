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
import { readAndParse } from "@fluidframework/driver-utils";
import { loggerToMonitoringContext } from "@fluidframework/telemetry-utils";
import { addBlobToSummary } from "@fluidframework/runtime-utils";

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

const metadata = "metadata";

enum MigrationState {
	NotStarted,
	Completed,
	ShouldNotMigrate,
}

/**
 * Create skeleton Migration Shim that can hot swap from one DDS to a new DDS.
 */
export class Shim extends TypedEventEmitter<IMigrationEvent> implements IChannel {
	public constructor(
		public readonly id: string,
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly legacyTreeFactory: LegacySharedTreeFactory,
		private readonly newTreeFactory: SharedTreeFactory,
		private readonly populateNewSharedObjectFn: (
			legacyTree: LegacySharedTree,
			newTree: ISharedTree,
		) => void,
	) {
		super();
		this.mc = loggerToMonitoringContext(this.runtime.logger);
	}

	private readonly mc: ReturnType<typeof loggerToMonitoringContext>;

	private _migrationState: MigrationState | undefined;
	private get migrationState(): MigrationState {
		assert(this._migrationState !== undefined, "Migration state should be defined");
		return this._migrationState;
	}

	private legacyTree: LegacySharedTree | undefined;

	private newTree: ISharedTree | undefined;

	// This is the magic button that tells this Spanner and all other Spanners to swap to the new Shared Object.
	public submitMigrateOp(): void {
		assert(this.migrationState === MigrationState.NotStarted, "Invalid state");

		// These console logs are for compilation purposes
		console.log(this.runtime);
		console.log(this.legacyTreeFactory);
		console.log(this.newTreeFactory);
		console.log(this.populateNewSharedObjectFn);
		this._migrationState = MigrationState.Completed;
		throw new Error("Method not implemented.");
	}

	public get currentTree(): LegacySharedTree | ISharedTree {
		switch (this.migrationState) {
			case MigrationState.NotStarted: {
				assert(
					this.newTree === undefined && this.legacyTree !== undefined,
					"Invalid NotStarted state",
				);
				return this.legacyTree;
			}
			case MigrationState.ShouldNotMigrate: {
				assert(
					this.newTree !== undefined && this.legacyTree === undefined,
					"Invalid ShouldNotMigrate state",
				);
				return this.newTree;
			}
			case MigrationState.Completed: {
				assert(
					this.newTree !== undefined && this.legacyTree !== undefined,
					"Invalid Completed state",
				);
				return this.newTree;
			}
			default: {
				throw new Error("Migration state is not valid");
			}
		}
	}

	/**
	 * We could do two different shim objects, but then we would still need to pass in the "legacy" SharedTree
	 * attributes to the new SharedTreeShim on create. It would look very weird in the code that we would be using
	 * legacy SharedTree attributes for the Shim attributes.
	 *
	 * If we decide that the attributes of the shim should be in the summary, then the document can have multiple
	 * different snapshot formats,
	 * 1. LegacySharedTree Attributes
	 * 2. LegacyShim Attributes
	 * 3. New SharedTree Attributes
	 * 4. NewShim Attributes - if we decide not to unify everything.
	 */
	public async load(services: IChannelServices): Promise<void> {
		const storage = services.objectStorage;
		const attributes = await readAndParse<IChannelAttributes>(storage, metadata);
		if (attributes.type === this.legacyTreeFactory.type) {
			this.legacyTree = (await this.legacyTreeFactory.load(
				this.runtime,
				this.id,
				services,
				this.legacyTreeFactory.attributes,
			)) as LegacySharedTree;
			this._migrationState = MigrationState.NotStarted;
			return;
		} else if (attributes.type === this.newTreeFactory.type) {
			this.newTree = await this.newTreeFactory.load(
				this.runtime,
				this.id,
				services,
				this.newTreeFactory.attributes,
			);
			this._migrationState = MigrationState.ShouldNotMigrate;
			return;
		}
		throw new Error("Invalid type");
	}
	public create(): void {
		// Before creating a new sharedTree, you have to make sure all your code can load the new sharedTree.
		const createNewTree = this.mc.config.getBoolean("Fluid.Shim.CreateNewTree");
		if (createNewTree === true) {
			this.newTree = this.newTreeFactory.create(this.runtime, this.id);
			this._migrationState = MigrationState.ShouldNotMigrate;
			return;
		} else {
			this.legacyTree = this.legacyTreeFactory.create(this.runtime, this.id);
			this._migrationState = MigrationState.NotStarted;
		}
	}

	public readonly attributes: IChannelAttributes = this.legacyTreeFactory.attributes;
	public getAttachSummary(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
	): ISummaryTreeWithStats {
		const summary = this.currentTree.getAttachSummary(fullTree, trackState, telemetryContext);
		addBlobToSummary(summary, metadata, JSON.stringify(this.legacyTreeFactory.attributes));
		return summary;
	}
	public async summarize(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined,
	): Promise<ISummaryTreeWithStats> {
		const summary = await this.currentTree.summarize(
			fullTree,
			trackState,
			telemetryContext,
			incrementalSummaryContext,
		);
		addBlobToSummary(summary, metadata, JSON.stringify(this.legacyTreeFactory.attributes));
		return summary;
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
