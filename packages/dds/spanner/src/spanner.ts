/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils";
import {
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import {
	ITelemetryContext,
	ISummaryTreeWithStats,
	IExperimentalIncrementalSummaryContext,
	IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import { SharedObject } from "@fluidframework/shared-object-base";
import { SpannerHandle } from "./spannerHandle";
import { SpannerChannelServices } from "./spannerChannelServices";

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
export class Spanner<TOld extends SharedObject, TNew extends SharedObject> implements IChannel {
	public constructor(
		public readonly id: string,
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly newFactory: IChannelFactory,
		private readonly oldSharedObject?: TOld,
		private newSharedObject?: TNew,
	) {
		assert(newSharedObject !== undefined || oldSharedObject !== undefined, "Must provide one");
	}

	private services?: SpannerChannelServices;

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

	/**
	 * This should be private, the responsibility of swap is to generate the new SharedObject in a detached state to
	 * allow for the new SharedObject to be created and modified without sending ops.
	 *
	 * As a prototype this is ok, for a final design, this isn't.
	 */
	public swap(): { new: TNew; old: TOld } {
		if (this.newSharedObject !== undefined) {
			throw new Error("Already swapped");
		}
		this.newSharedObject = this.newFactory.create(this.runtime, this.id) as TNew;
		assert(this.oldSharedObject !== undefined, "Should have an old object to swap");
		return { new: this.newSharedObject, old: this.oldSharedObject };
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
	 * This code was tricker to implement than expected... SharedObjects call connect when they are attached via
	 * handles. They call load when they're loaded by the factory, but both methods cannot be called together. If load
	 * is called on an attached/ing SharedObject, calling connect later will break, if connect is called, calling load
	 * will break. Granted calling connect then load doesn't make much sense. Loading almost essentially the same as
	 * calling connect. The only difference is that loading also populates the SharedObject with data.
	 */
	public connect(services: IChannelServices): void {
		assert(this.services === undefined, "Can only connect once");
		this.services = new SpannerChannelServices(services);
		this.services.deltaConnection.migrate = (message: ISequencedDocumentMessage): boolean =>
			this.processMigrateOp(message);
		this.target.connect(this.services);
	}

	// Look at the explanation for connect to understand load
	public load(services: SpannerChannelServices): void {
		assert(this.services === undefined, "Can only connect once");
		this.services = services;
	}

	// This is to attach the new SharedObject's DeltaHandler to the DeltaConnection. Not sure what needs to be done
	// with the new SharedObject's object storage.
	public reconnect(): void {
		assert(this.services !== undefined, "Must connect before reconnecting");
		assert(this.newSharedObject !== undefined, "Can only reconnect the new shared object!");
		this.newSharedObject.connect(this.services);
	}

	// This seems to work.
	public getGCData(fullGC?: boolean | undefined): IGarbageCollectionData {
		return this.target.getGCData(fullGC);
	}

	// This is the magic button that tells this Spanner and all other Spanners to swap to the new Shared Object.
	public submitMigrateOp(): void {
		// Will need to add some sort of error handling here to check for data processing errors
		if (this.isAttached()) {
			assert(this.services !== undefined, "Must be connected before submitting");
			assert(
				this.oldSharedObject !== undefined,
				"Should be migrating from old shared object!",
			);
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
	private processMigrateOp(message: ISequencedDocumentMessage): boolean {
		const contents = message.contents as IHotSwapOp;
		if (contents.type === "hotSwap") {
			const { new: newSharedObject, old: oldSharedObject } = this.swap();
			this.populateNewSharedObject(oldSharedObject, newSharedObject);
			this.reconnect();
			return true;
		}
		return false;
	}

	/**
	 * This is a hook for the Customer to move data from the old SharedObject to the new SharedObject
	 * For the prototype this is hacky and the customer just sets the function, but for the final design this should be
	 * a pass-in function in the SpannerFactory, or some where else.
	 */
	public populateNewSharedObject: (oldSharedObject: TOld, newSharedObject: TNew) => void =
		() => {};
}
