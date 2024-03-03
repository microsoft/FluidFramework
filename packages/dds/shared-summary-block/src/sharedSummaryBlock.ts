/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
	Jsonable,
	IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import {
	createSingleBlobSummary,
	IFluidSerializer,
	SharedObject,
} from "@fluidframework/shared-object-base";
import { SharedSummaryBlockFactory } from "./sharedSummaryBlockFactory.js";
import { ISharedSummaryBlock } from "./interfaces.js";

const snapshotFileName = "header";

/**
 * Defines the in-memory object structure to be used for the conversion to/from serialized.
 * Directly used in JSON.stringify, direct result from JSON.parse.
 */
interface ISharedSummaryBlockDataSerializable {
	[key: string]: Jsonable<unknown>;
}

/**
 * Implementation of a shared summary block. It does not generate any ops. It is only part of the summary.
 * Data should be set in this object in response to a remote op.
 * @alpha
 */
export class SharedSummaryBlock extends SharedObject implements ISharedSummaryBlock {
	/**
	 * Create a new shared summary block
	 *
	 * @param runtime - data store runtime the new shared summary block belongs to.
	 * @param id - optional name of the shared summary block.
	 * @returns newly created shared summary block (but not attached yet).
	 */
	public static create(runtime: IFluidDataStoreRuntime, id?: string) {
		return runtime.createChannel(id, SharedSummaryBlockFactory.Type) as SharedSummaryBlock;
	}

	/**
	 * Get a factory for SharedSummaryBlock to register with the data store.
	 *
	 * @returns a factory that creates and loads SharedSummaryBlock.
	 */
	public static getFactory(): IChannelFactory {
		return new SharedSummaryBlockFactory();
	}

	/**
	 * The data held by this object.
	 */
	private readonly data = new Map<string, Jsonable<unknown>>();

	/**
	 * Constructs a new SharedSummaryBlock. If the object is non-local, an id and service interfaces will
	 * be provided.
	 *
	 * @param id - optional name of the shared summary block.
	 * @param runtime - data store runtime thee object belongs to.
	 * @param attributes - The attributes for the object.
	 */
	constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
		super(id, runtime, attributes, "fluid_sharedSummaryBlock_");
	}

	/**
	 * {@inheritDoc ISharedSummaryBlock.get}
	 */
	public get<T>(key: string): Jsonable<T> {
		return this.data.get(key) as Jsonable<T>;
	}

	/**
	 * {@inheritDoc ISharedSummaryBlock.set}
	 */
	public set<T>(key: string, value: Jsonable<T>): void {
		this.data.set(key, value);
		// Set this object as dirty so that it is part of the next summary.
		this.dirty();
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.summarizeCore}
	 */
	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		const contentsBlob: ISharedSummaryBlockDataSerializable = {};
		this.data.forEach((value, key) => {
			contentsBlob[key] = value;
		});
		return createSingleBlobSummary(snapshotFileName, JSON.stringify(contentsBlob));
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const contents = await readAndParse<ISharedSummaryBlockDataSerializable>(
			storage,
			snapshotFileName,
		);
		for (const [key, value] of Object.entries(contents)) {
			this.data.set(key, value);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onDisconnect}
	 */
	protected onDisconnect() {}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processCore}
	 */
	protected processCore(message: ISequencedDocumentMessage, local: boolean) {
		throw new Error("shared summary block should not generate any ops.");
	}

	protected applyStashedOp() {
		throw new Error("not implemented");
	}
}
