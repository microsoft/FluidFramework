/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions";
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
import { MessageType, type ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { NoDeltasChannelServices, ShimChannelServices } from "./shimChannelServices.js";
import { MigrationShimDeltaHandler } from "./migrationDeltaHandler.js";

/**
 * Interface for migration events to indicate the stage of the migration. There really is two stages: before, and after.
 *
 * @public
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
	type: "barrier";
	/**
	 * Old channel attributes so we can do verification and understand what changed. This will allow future clients to
	 * accurately reason about what state of the document was before the migration op initiated at.
	 */
	oldAttributes: IChannelAttributes;
	/**
	 * New channel attributes so we can do verification and understand what changed. This will allow future clients to
	 * accurately reason about what the migration state of the new container is expected to be.
	 */
	newAttributes: IChannelAttributes;
}

/**
 * The MigrationShim loads in place of the legacy SharedTree.  It provides API surface for migrating it to the new SharedTree, while also providing access to the current SharedTree for usage.
 *
 * @remarks
 *
 * This MigrationShim is responsible for submitting a migration op, processing the migrate op, swapping from the old
 * tree to the new tree, loading an old tree snapshot and creating an old tree.
 *
 * The MigrationShim expects to always load from a legacy SharedTree snapshot, though by the time it catches up in
 * processing all ops, it may find that the migration has already occurred.  After migration occurs, it modifies its
 * attributes to point at the SharedTreeShimFactory.  This will cause future clients to load with a SharedTreeShim and
 * the new SharedTree snapshot instead after the next summarization.
 *
 * @public
 */
export class MigrationShim extends TypedEventEmitter<IMigrationEvent> implements IChannel {
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
		// TODO: consider flattening this class
		this.migrationDeltaHandler = new MigrationShimDeltaHandler(this.processMigrateOp);
	}

	// TODO: process migrate op implementation, it'll look something like this
	// Maybe we just flatten the migrationDeltaHandler into this class?
	// Or we pass in this and have some "process and submit logic here"
	// The cost is that this class gets big.
	private readonly processMigrateOp = (message: ISequencedDocumentMessage): boolean => {
		if (
			// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
			message.type !== MessageType.Operation ||
			(message.contents as Partial<IMigrationOp>).type !== "barrier"
		) {
			return false;
		}
		this.newTree = this.newTreeFactory.create(this.runtime, this.id);
		this.populateNewSharedObjectFn(this.legacyTree, this.newTree);
		this.reconnect();
		this.emit("migrated");
		return true;
	};

	private readonly migrationDeltaHandler: MigrationShimDeltaHandler;
	private services?: ShimChannelServices;

	private _legacyTree: LegacySharedTree | undefined;
	private get legacyTree(): LegacySharedTree {
		assert(this._legacyTree !== undefined, "Old tree not initialized");
		return this._legacyTree;
	}

	private newTree: ISharedTree | undefined;

	// Migration occurs once this op is read.
	public submitMigrateOp(): void {
		const migrateOp: IMigrationOp = {
			type: "barrier",
			oldAttributes: this.legacyTreeFactory.attributes,
			newAttributes: this.newTreeFactory.attributes,
		};

		// This is a copy of submit local message from SharedObject
		if (this.isAttached()) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			this.services!.deltaConnection.submit(migrateOp, undefined);
		}
	}

	public get currentTree(): LegacySharedTree | ISharedTree {
		// TODO: sync the returning of new tree with the "migrated" event
		return this.newTree ?? this.legacyTree;
	}

	public async load(services: IChannelServices): Promise<void> {
		const shimServices =
			this.runtime.attachState === AttachState.Detached
				? new NoDeltasChannelServices(services)
				: this.generateShimServicesOnce(services);
		this._legacyTree = (await this.legacyTreeFactory.load(
			this.runtime,
			this.id,
			shimServices,
			this.legacyTreeFactory.attributes,
		)) as LegacySharedTree;
	}
	public create(): void {
		// TODO: Should we be allowing the creation of legacy shared trees?
		this._legacyTree = this.legacyTreeFactory.create(this.runtime, this.id);
	}

	public get attributes(): IChannelAttributes {
		return this.currentTree.attributes;
	}
	public getAttachSummary(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
	): ISummaryTreeWithStats {
		return this.currentTree.getAttachSummary(fullTree, trackState, telemetryContext);
	}
	public async summarize(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined,
	): Promise<ISummaryTreeWithStats> {
		return this.currentTree.summarize(
			fullTree,
			trackState,
			telemetryContext,
			incrementalSummaryContext,
		);
	}
	public isAttached(): boolean {
		return this.currentTree.isAttached();
	}

	// Only connect to the legacy shared tree
	public connect(services: IChannelServices): void {
		const shimServices = this.generateShimServicesOnce(services);
		this.legacyTree.connect(shimServices);
	}

	// Only reconnect to the new shared tree this limits us to only migrating
	private reconnect(): void {
		assert(this.services !== undefined, "Not connected");
		assert(this.newTree !== undefined, "New tree not initialized");
		// This method attaches the newTree's delta handler to the MigrationShimDeltaHandler
		this.newTree.connect(this.services);
	}

	private generateShimServicesOnce(services: IChannelServices): ShimChannelServices {
		assert(this.services === undefined, "Already connected");
		this.services = new ShimChannelServices(services, this.migrationDeltaHandler);
		return this.services;
	}

	public getGCData(fullGC?: boolean | undefined): IGarbageCollectionData {
		return this.currentTree.getGCData(fullGC);
	}
	public handle!: IFluidHandle;
	public IFluidLoadable!: IFluidLoadable;
}
