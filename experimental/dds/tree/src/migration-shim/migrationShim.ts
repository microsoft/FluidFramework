/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type EventEmitterEventType } from '@fluid-internal/client-utils';
import { AttachState } from '@fluidframework/container-definitions';
import { type IEvent, type IFluidHandle, type IFluidLoadable } from '@fluidframework/core-interfaces';
import { assert } from '@fluidframework/core-utils/internal';
import {
	type IChannelAttributes,
	IChannelFactory,
	type IFluidDataStoreRuntime,
	type IChannel,
	type IChannelServices,
} from '@fluidframework/datastore-definitions/internal';
import { type ISequencedDocumentMessage } from '@fluidframework/driver-definitions';
import { MessageType } from '@fluidframework/driver-definitions/internal';
import type { SessionId } from '@fluidframework/id-compressor';
import type { IIdCompressorCore } from '@fluidframework/id-compressor/internal';
import {
	type IExperimentalIncrementalSummaryContext,
	type IGarbageCollectionData,
	type ISummaryTreeWithStats,
	type ITelemetryContext,
} from '@fluidframework/runtime-definitions/internal';
import { DataProcessingError, EventEmitterWithErrorHandling } from '@fluidframework/telemetry-utils/internal';
import { type ITree } from '@fluidframework/tree';

import {
	type SharedTree as LegacySharedTree,
	type SharedTreeFactory as LegacySharedTreeFactory,
} from '../SharedTree.js';

import { MigrationShimDeltaHandler } from './migrationDeltaHandler.js';
import { type IShimChannelServices, NoDeltasChannelServices } from './shimChannelServices.js';
import { PreMigrationDeltaConnection, StampDeltaConnection } from './shimDeltaConnection.js';
import { ShimHandle } from './shimHandle.js';
import { type IOpContents, type IShim } from './types.js';

/**
 * Interface for migration events to indicate the stage of the migration. There really is two stages: before, and after.
 *
 * @internal
 */
export interface IMigrationEvent extends IEvent {
	/**
	 * Event that is emitted when the migration is complete.
	 */
	(event: 'migrated', listener: () => void);
}

/**
 * Interface for migration operation.
 */
export interface IMigrationOp {
	/**
	 * Type of the migration operation.
	 */
	type: 'barrier';
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

const ghostSessionId = '3692b242-46c0-4076-abea-c2ac1e896dee' as SessionId;

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
 * @internal
 */
export class MigrationShim extends EventEmitterWithErrorHandling<IMigrationEvent> implements IShim {
	public constructor(
		public readonly id: string,
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly legacyTreeFactory: LegacySharedTreeFactory,
		private readonly newTreeFactory: IChannelFactory<ITree>,
		private readonly populateNewSharedObjectFn: (legacyTree: LegacySharedTree, newTree: ITree) => void
	) {
		super((event: EventEmitterEventType, e: unknown) => this.eventListenerErrorHandler(event, e));
		// TODO: consider flattening this class
		this.migrationDeltaHandler = new MigrationShimDeltaHandler(
			this.processMigrateOp,
			this.submitLocalMessage,
			this.newTreeFactory.attributes
		);
		this.handle = new ShimHandle<MigrationShim>(this);
	}

	private readonly processMigrateOp = (message: ISequencedDocumentMessage): boolean => {
		if (message.type !== MessageType.Operation || (message.contents as Partial<IMigrationOp>).type !== 'barrier') {
			return false;
		}
		const newTree = this.newTreeFactory.create(this.runtime, this.id);
		assert(this.preMigrationDeltaConnection !== undefined, 0x82f /* Should be in v1 state */);
		this.preMigrationDeltaConnection.disableSubmit();
		const { idCompressor } = this.runtime;
		if (idCompressor !== undefined) {
			(idCompressor as unknown as IIdCompressorCore).beginGhostSession(ghostSessionId, () =>
				this.populateNewSharedObjectFn(this.legacyTree, newTree)
			);
		} else {
			this.populateNewSharedObjectFn(this.legacyTree, newTree);
		}
		this.newTree = newTree;
		this.reconnect();
		this.emit('migrated');
		return true;
	};

	private readonly migrationDeltaHandler: MigrationShimDeltaHandler;
	private services?: IChannelServices;
	private preMigrationDeltaConnection?: PreMigrationDeltaConnection;
	private postMigrationServices?: IShimChannelServices;

	private _legacyTree: LegacySharedTree | undefined;
	private get legacyTree(): LegacySharedTree {
		assert(this._legacyTree !== undefined, 0x7e6 /* Old tree not initialized */);
		return this._legacyTree;
	}

	private newTree: (IChannel & ITree) | undefined;

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.closeError}
	 */
	private closeError?: ReturnType<typeof DataProcessingError.wrapIfUnrecognized>;

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.eventListenerErrorHandler}
	 */
	private eventListenerErrorHandler(event: EventEmitterEventType, e: unknown): void {
		const error = DataProcessingError.wrapIfUnrecognized(e, 'SharedObjectEventListenerException');
		error.addTelemetryProperties({ emittedEventName: String(event) });

		this.closeWithError(error);
		throw error;
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.closeWithError}
	 */
	private closeWithError(error: ReturnType<typeof DataProcessingError.wrapIfUnrecognized>): void {
		if (this.closeError === undefined) {
			this.closeError = error;
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.verifyNotClosed}
	 */
	private verifyNotClosed(): void {
		if (this.closeError !== undefined) {
			throw this.closeError;
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.submitLocalMessage}
	 */
	private readonly submitLocalMessage = (message: IOpContents): void => {
		this.verifyNotClosed();
		// This is a copy of submit local message from SharedObject
		if (this.isAttached()) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			this.services!.deltaConnection.submit(message, undefined);
		}
	};

	// Migration occurs once this op is read.
	public submitMigrateOp(): void {
		const migrateOp: IMigrationOp = {
			type: 'barrier',
			oldAttributes: this.legacyTreeFactory.attributes,
			newAttributes: this.newTreeFactory.attributes,
		};

		this.submitLocalMessage(migrateOp);
	}

	public get currentTree(): IChannel & (LegacySharedTree | ITree) {
		return this.newTree ?? this.legacyTree;
	}

	public async load(services: IChannelServices): Promise<void> {
		const shimServices =
			this.runtime.attachState === AttachState.Detached
				? new NoDeltasChannelServices(services)
				: this.generateShimServicesOnce(services);
		this._legacyTree = await this.legacyTreeFactory.load(
			this.runtime,
			this.id,
			shimServices,
			this.legacyTreeFactory.attributes
		);
	}
	public create(): void {
		this._legacyTree = this.legacyTreeFactory.create(this.runtime, this.id);
	}

	public get attributes(): IChannelAttributes {
		return this.currentTree.attributes;
	}
	public getAttachSummary(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined
	): ISummaryTreeWithStats {
		return this.currentTree.getAttachSummary(fullTree, trackState, telemetryContext);
	}
	public async summarize(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined
	): Promise<ISummaryTreeWithStats> {
		return this.currentTree.summarize(fullTree, trackState, telemetryContext, incrementalSummaryContext);
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
		assert(this.services !== undefined, 0x7e7 /* Not connected */);
		assert(this.newTree !== undefined, 0x7e8 /* New tree not initialized */);
		assert(this.postMigrationServices === undefined, 0x830 /* Already reconnected! */);
		// This method attaches the newTree's delta handler to the MigrationShimDeltaHandler
		this.postMigrationServices = {
			objectStorage: this.services.objectStorage,
			deltaConnection: new StampDeltaConnection(
				this.services.deltaConnection,
				this.migrationDeltaHandler,
				this.newTree.attributes
			),
		};
		this.newTree.connect(this.postMigrationServices);
	}

	/**
	 * Only generate the ShimServices once as the underlying DeltaHandler can only be connected to once. If we connect
	 * twice, we will be in a "v2" state even though we really are in a "v1" state. We will encounter unexpected op
	 * dropping behavior or lack thereof and may corrupt the document.
	 * @param services - the services to generate the shim services from
	 * @returns - shim services
	 */
	private generateShimServicesOnce(services: IChannelServices): IShimChannelServices {
		assert(
			this.services === undefined && this.preMigrationDeltaConnection === undefined,
			0x7e9 /* Already connected */
		);
		this.services = services;
		this.preMigrationDeltaConnection = new PreMigrationDeltaConnection(
			this.services.deltaConnection,
			this.migrationDeltaHandler
		);
		const shimServices: IShimChannelServices = {
			objectStorage: this.services.objectStorage,
			deltaConnection: this.preMigrationDeltaConnection,
		};
		return shimServices;
	}

	public getGCData(fullGC?: boolean | undefined): IGarbageCollectionData {
		return this.currentTree.getGCData(fullGC);
	}
	public handle: IFluidHandle<MigrationShim>;
	public get IFluidLoadable(): IFluidLoadable {
		return this;
	}
}
