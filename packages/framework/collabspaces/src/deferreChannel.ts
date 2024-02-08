/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	type IFluidDataStoreRuntime,
	type IChannelFactory,
	type IChannelServices,
	IChannelAttributes,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions";
import {
	createSingleBlobSummary,
	type IFluidSerializer,
	SharedObject,
} from "@fluidframework/shared-object-base";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { readAndParse } from "@fluidframework/driver-utils";

import { type ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import { ICollabChannel } from "./contracts";
import { pkgVersion } from "./packageVersion";

const snapshotFileName = "header";

/**
 * Deferred Channel
 */
export class DeferredChannel extends SharedObject implements ICollabChannel {
	readonly type = DeferredChannel.Type;
	static readonly Type = "CollabSpaceDeferredChannelType";

	private ops: ISequencedDocumentMessage[] = [];

	public getOps() {
		return this.ops;
	}

	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "fluid_collabspace_deferred");
	}

	public get value() {
		assert(false, "should not be called");
		return undefined;
	}

	public static create(runtime: IFluidDataStoreRuntime, id?: string): DeferredChannel {
		return runtime.createChannel(id, DeferredChannel.Type) as DeferredChannel;
	}

	public static getFactory(): IChannelFactory {
		return new DeferredChannelFactory();
	}

	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		return createSingleBlobSummary(snapshotFileName, JSON.stringify(this.ops));
	}

	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		this.ops = await readAndParse<ISequencedDocumentMessage[]>(storage, snapshotFileName);
	}

	protected onDisconnect(): void {}

	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		this.ops.push(message);
	}

	protected applyStashedOp(op: unknown): void {
		assert(false, "there should be no stashed ops!");
	}
}

/**
 * Deferred Channel Factory
 */
export class DeferredChannelFactory implements IChannelFactory {
	public static readonly Attributes: IChannelAttributes = {
		type: DeferredChannel.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type(): string {
		return DeferredChannel.Type;
	}

	public get attributes(): IChannelAttributes {
		return DeferredChannelFactory.Attributes;
	}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<ICollabChannel> {
		const counter = new DeferredChannel(id, runtime, attributes);
		await counter.load(services);
		return counter;
	}

	public create(document: IFluidDataStoreRuntime, id: string): ICollabChannel {
		const counter = new DeferredChannel(id, document, this.attributes);
		counter.initializeLocal();
		return counter;
	}

	public create2(
		runtime: IFluidDataStoreRuntime,
		id: string,
		initialValue: unknown,
	): ICollabChannel {
		assert(initialValue === undefined, "initial value");
		const channel = new DeferredChannel(id, runtime, this.attributes);
		return channel;
	}
}
