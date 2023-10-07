/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	type IFluidHandle,
	type IFluidLoadable,
	type IEvent,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils";
import { AttachState } from "@fluidframework/container-definitions";
import {
	type IChannel,
	type IChannelAttributes,
	type IChannelFactory,
	type IChannelServices,
	type IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import {
	type ITelemetryContext,
	type ISummaryTreeWithStats,
	type IExperimentalIncrementalSummaryContext,
	type IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import { type ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import { type SharedObject } from "@fluidframework/shared-object-base";
import { SpannerHandle } from "./spannerHandle";
import {
	NoDeltasChannelServices as NoDeltaChannelServices,
	SpannerChannelServices,
} from "./spannerChannelServices";
import { SpannerDeltaHandler } from "./spannerDeltaHandler";
import { attributesMatch } from "./utils";

interface IHotSwapEvent extends IEvent {
	(event: "migrated", listener: () => void);
}

interface IHotSwapOp {
	type: "hotSwap";
	oldAttributes: IChannelAttributes;
	newAttributes: IChannelAttributes;
}

/**
 * A channel that can swap Distributed Data Structures (DDS)
 *
 * The IChannel interface was chosen so that the attributes blob could properly return the right information
 *
 * Furthermore accessing the methods of the SharedObject underneath would need to be modified.
 *
 * Maybe there's a way of doing the SharedObject implementation. We would still need to intercept the handlers.
 * This implementation is a little more agnostic of the interfaces. Interesting fact, ISharedObject does not expose
 *
 * There may be no need to extend SharedObject, but rather just IChannel should be fine
 */
export class Spanner<TOld extends SharedObject, TNew extends SharedObject>
	extends TypedEventEmitter<IHotSwapEvent>
	implements IChannel
{
	public constructor(
		public readonly id: string,
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly oldFactory: IChannelFactory,
		private readonly newFactory: IChannelFactory,
		private readonly populateNewSharedObjectFn: (
			oldSharedObject: TOld,
			newSharedObject: TNew,
		) => void,
	) {
		super();
		this.deltaHandler = new SpannerDeltaHandler(this.processMigrateOp);
	}
	private _oldSharedObject?: TOld;
	private get oldSharedObject(): TOld {
		assert(this._oldSharedObject !== undefined, "Must load before accessing");
		return this._oldSharedObject;
	}
	private newSharedObject?: TNew;

	private readonly deltaHandler: SpannerDeltaHandler;

	private _services?: SpannerChannelServices;
	private get services(): SpannerChannelServices {
		assert(this._services !== undefined, "Must connect services before accessing");
		return this._services;
	}

	// This is what returns the new SharedObject. This is what the customer will interact with to get the underlying
	// SharedObject.
	public get target(): TOld | TNew {
		const sharedObject = this.newSharedObject ?? this.oldSharedObject;
		assert(sharedObject !== undefined, "Must provide one");
		return sharedObject;
	}

	// Allows for the summarization of attributes during summarization and correct display of channel attributes.
	// We don't want to save the attributes of the Spanner, but the attributes of the underlying SharedObject.
	public get attributes(): IChannelAttributes {
		return this.target.attributes;
	}

	// Maybe we can somehow use the FluidObjectHandle? This works for the prototype.
	public readonly handle: IFluidHandle<Spanner<TOld, TNew>> = new SpannerHandle(this);

	// Not exactly sure if this is right.
	public get IFluidLoadable(): IFluidLoadable {
		return this;
	}

	// This allows the attach summary to look like there isn't a "Spanner" object that gets created
	public getAttachSummary(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
	): ISummaryTreeWithStats {
		// Note I think telemetry context could be wrong here
		return this.target.getAttachSummary(fullTree, trackState, telemetryContext);
	}

	// This allows the summary to look like there isn't a "Spanner" object that gets created
	public async summarize(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined,
	): Promise<ISummaryTreeWithStats> {
		// Note telemetry context could be wrong here
		return this.target.summarize(
			fullTree,
			trackState,
			telemetryContext,
			incrementalSummaryContext,
		);
	}

	// Hopefully this works
	public isAttached(): boolean {
		return this.target.isAttached();
	}

	/**
	 * Connects the Spanner's delta handler to the underlying channel services. At this point, no SharedObjects should
	 * be connected and processing an op will hit an assert.
	 *
	 * This allows us to swap handlers on the fly and process the migrate/barrier op, and stamp v2 ops.
	 */
	private connectServicesOnce(services: IChannelServices): SpannerChannelServices {
		assert(this._services === undefined, "Can only connect once, trying to connect");
		this._services = new SpannerChannelServices(services);
		this.services.deltaConnection.preAttach(this.deltaHandler);
		return this.services;
	}

	/**
	 * SharedObjects call connect when they are attached via handles. They call load when they're loaded by the
	 * factory, but both methods cannot be called together. If load is called on an attached/ing SharedObject, calling
	 * connect later will break, if connect is called, calling load will break. Granted calling connect then load
	 * doesn't make much sense. Loading almost essentially the same as calling connect. The only difference is that
	 * loading also populates the SharedObject with data.
	 */
	public connect(services: IChannelServices): void {
		this.connectServicesOnce(services);
		assert(
			this.services.deltaConnection.isPreAttachState() === true,
			"Should be preAttach state",
		);
		this.oldSharedObject.connect(this.services);
		assert(this.services.deltaConnection.isUsingOldV1(), "Should be using old V1");
	}

	// Look at the explanation for connect to understand load
	public async load(services: IChannelServices, attributes: IChannelAttributes): Promise<void> {
		const spannerServices =
			this.runtime.attachState === AttachState.Detached
				? new NoDeltaChannelServices(services)
				: this.connectServicesOnce(services);
		assert(attributesMatch(attributes, this.oldFactory.attributes), "Attributes mismatch!");
		this._oldSharedObject = (await this.oldFactory.load(
			this.runtime,
			this.id,
			spannerServices,
			attributes,
		)) as TOld;
		assert(this.services.deltaConnection.isUsingOldV1(), "Should be using old V1");
	}

	// We need to initialize the old SharedObject, the problem is that during load we already initialize the old shared
	// object with data. This function allows us to create the old SharedObject without data.
	public initializeLocal(): void {
		this._oldSharedObject = this.oldFactory.create(this.runtime, this.id) as TOld;
	}

	// This is to attach the new SharedObject's DeltaHandler to the DeltaConnection. Not sure what needs to be done
	// with the new SharedObject's object storage.
	private reconnect(): void {
		assert(this.newSharedObject !== undefined, "Not in pre-reconnect state!");
		this.newSharedObject.connect(this.services);
		assert(this.services.deltaConnection.isUsingNewV2(), "Should be using new V2");
	}

	// This seems to work.
	public getGCData(fullGC?: boolean | undefined): IGarbageCollectionData {
		return this.target.getGCData(fullGC);
	}

	// This is the magic button that tells this Spanner and all other Spanners to swap to the new Shared Object.
	public submitMigrateOp(): void {
		// Will need to add some sort of error handling here to check for data processing errors
		if (this.isAttached()) {
			assert(
				this.newSharedObject === undefined,
				"Should be migrating to a new shared object!",
			);
			const op: IHotSwapOp = {
				type: "hotSwap",
				oldAttributes: this.oldSharedObject.attributes,
				newAttributes: this.newFactory.attributes,
			};
			this.services.deltaConnection.submit(op, undefined);
		}
	}

	// This allows the Spanner to process a migrate/barrier op, swap the SharedObjects, populate the new SharedObject
	// with the old SharedObject's data, and reconnect the new SharedObject.
	private readonly processMigrateOp = (message: ISequencedDocumentMessage): boolean => {
		const contents = message.contents as IHotSwapOp;
		if (contents.type !== "hotSwap") {
			return false;
		}
		assert(
			attributesMatch(contents.oldAttributes, this.oldSharedObject.attributes) &&
				attributesMatch(contents.newAttributes, this.newFactory.attributes),
			"Migrate op attributes mismatch!",
		);

		// Only swap once while processing the migrate op
		if (this.newSharedObject === undefined) {
			this.newSharedObject = this.newFactory.create(this.runtime, this.id) as TNew;
			this.populateNewSharedObjectFn(this.oldSharedObject, this.newSharedObject);
			this.reconnect();
			this.emit("migrated");
		}
		return true;
	};
}
