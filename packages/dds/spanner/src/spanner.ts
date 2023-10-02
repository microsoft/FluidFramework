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

	public get target(): TOld | TNew {
		const sharedObject = this.newSharedObject ?? this.oldSharedObject;
		assert(sharedObject !== undefined, "Must provide one");
		return sharedObject;
	}

	public get attributes(): IChannelAttributes {
		return this.target.attributes;
	}

	public readonly handle: IFluidHandle<TOld | TNew> = new SpannerHandle(this);

	public get IFluidLoadable(): IFluidLoadable {
		return this;
	}

	public swap(): { new: TNew; old: TOld } {
		if (this.newSharedObject !== undefined) {
			throw new Error("Already swapped");
		}
		this.newSharedObject = this.newFactory.create(this.runtime, this.id) as TNew;
		assert(this.oldSharedObject !== undefined, "Should have an old object to swap");
		return { new: this.newSharedObject, old: this.oldSharedObject };
	}

	public getAttachSummary(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
	): ISummaryTreeWithStats {
		return this.target.getAttachSummary(fullTree, trackState, telemetryContext);
	}

	public async summarize(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined,
	): Promise<ISummaryTreeWithStats> {
		return this.target.summarize(
			fullTree,
			trackState,
			telemetryContext,
			incrementalSummaryContext,
		);
	}

	public isAttached(): boolean {
		return this.target.isAttached();
	}

	public connect(services: IChannelServices): void {
		assert(this.services === undefined, "Can only connect once");
		this.services = new SpannerChannelServices(services);
		this.services.deltaConnection.migrate = (message: ISequencedDocumentMessage): boolean =>
			this.processMigrateOp(message);
		this.target.connect(this.services);
	}

	public load(services: SpannerChannelServices): void {
		assert(this.services === undefined, "Can only connect once");
		this.services = services;
	}

	public reconnect(): void {
		assert(this.services !== undefined, "Must connect before reconnecting");
		assert(this.newSharedObject !== undefined, "Can only reconnect the new shared object!");
		this.newSharedObject.connect(this.services);
	}

	public getGCData(fullGC?: boolean | undefined): IGarbageCollectionData {
		return this.target.getGCData(fullGC);
	}

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

	public processMigrateOp(message: ISequencedDocumentMessage): boolean {
		const contents = message.contents as IHotSwapOp;
		if (contents.type === "hotSwap") {
			const { new: newSharedObject, old: oldSharedObject } = this.swap();
			this.migrate(oldSharedObject, newSharedObject);
			this.reconnect();
			return true;
		}
		return false;
	}

	public migrate: (oldSharedObject: TOld, newSharedObject: TNew) => void = () => {};
}
