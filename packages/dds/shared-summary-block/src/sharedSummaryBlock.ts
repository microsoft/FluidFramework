/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Jsonable,
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import {
	IFluidSerializer,
	SharedObject,
	createSingleBlobSummary,
} from "@fluidframework/shared-object-base/internal";

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
export class SharedSummaryBlockClass extends SharedObject implements ISharedSummaryBlock {
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
