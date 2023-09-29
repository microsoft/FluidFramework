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
	IDeltaConnection,
	IDeltaHandler,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import {
	ITelemetryContext,
	ISummaryTreeWithStats,
	IExperimentalIncrementalSummaryContext,
	IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";

import { SharedObject } from "@fluidframework/shared-object-base";

interface IHackableDeltaConnection extends IDeltaConnection {
	_handler: IDeltaHandler | undefined;
}

class SwappableHandle<TOld extends SharedObject, TNew extends SharedObject>
	implements IFluidHandle<TOld | TNew>
{
	public constructor(private readonly value: Spanner<TOld, TNew>) {}
	public get absolutePath(): string {
		return this.value.target.handle.absolutePath;
	}
	public get isAttached(): boolean {
		return this.value.target.handle.isAttached;
	}
	public attachGraph(): void {
		return this.value.target.handle.attachGraph();
	}
	public async get(): Promise<TOld | TNew> {
		return (await this.value.target.handle.get()) as TOld | TNew;
	}
	public bind(handle: IFluidHandle): void {
		this.value.target.handle.bind(handle);
	}
	public get IFluidHandle(): IFluidHandle<TOld | TNew> {
		return this.value.target.handle.IFluidHandle as IFluidHandle<TOld | TNew>;
	}
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
	private services?: IChannelServices;

	public get target(): TOld | TNew {
		const sharedObject = this.newSharedObject ?? this.oldSharedObject;
		assert(sharedObject !== undefined, "Must provide one");
		return sharedObject;
	}
	public get attributes(): IChannelAttributes {
		return this.target.attributes;
	}
	public readonly handle: IFluidHandle<TOld | TNew> = new SwappableHandle(this);

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
		this.services = services;
		this.target.connect(services);
	}

	public load(services: IChannelServices): void {
		this.services = services;
	}

	public reconnect(): void {
		assert(this.services !== undefined, "Must connect before reconnecting");
		assert(this.newSharedObject !== undefined, "Can only reconnect the new shared object!");
		(this.services.deltaConnection as unknown as IHackableDeltaConnection)._handler = undefined;
		this.newSharedObject.connect(this.services);
	}

	public getGCData(fullGC?: boolean | undefined): IGarbageCollectionData {
		return this.target.getGCData(fullGC);
	}
}
