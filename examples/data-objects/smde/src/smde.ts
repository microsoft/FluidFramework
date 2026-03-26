/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "@fluid-example/example-utils";
import { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/legacy";
import { FluidDataStoreRuntime, FluidObjectHandle } from "@fluidframework/datastore/legacy";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/legacy";
import { ISharedMap, SharedMap } from "@fluidframework/map/legacy";
import {
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions/legacy";
// eslint-disable-next-line import-x/no-internal-modules -- #26904: `sequence` internals used in examples
import { reservedTileLabelsKey, type ISharedString } from "@fluidframework/sequence/internal";
import { ReferenceType, SharedString } from "@fluidframework/sequence/legacy";

// eslint-disable-next-line import-x/no-internal-modules, import-x/no-unassigned-import
import "simplemde/dist/simplemde.min.css";

/**
 * Data object storing the data to back a SimpleMDE editor.  Primarily just a SharedString.
 */
export class SmdeDataObject extends EventEmitter implements IFluidLoadable {
	public static async load(
		runtime: IFluidDataStoreRuntime,
		existing: boolean,
	): Promise<SmdeDataObject> {
		const collection = new SmdeDataObject(runtime);
		await collection.initialize(existing);

		return collection;
	}

	private readonly innerHandle: IFluidHandle<this>;

	public get handle(): IFluidHandle<SmdeDataObject> {
		return this.innerHandle;
	}
	public get IFluidHandle(): IFluidHandle<SmdeDataObject> {
		return this.innerHandle;
	}
	public get IFluidLoadable(): IFluidLoadable {
		return this;
	}

	private root: ISharedMap | undefined;
	private _text: SharedString | undefined;

	public get text(): ISharedString {
		assert(this._text !== undefined, "SharedString property missing!");
		return this._text;
	}
	constructor(private readonly runtime: IFluidDataStoreRuntime) {
		super();

		this.innerHandle = new FluidObjectHandle(this, "", this.runtime.objectsRoutingContext);
	}

	private async initialize(existing: boolean): Promise<void> {
		if (!existing) {
			this.root = SharedMap.create(this.runtime, "root");
			const text = SharedString.create(this.runtime);

			// Initial paragraph marker
			text.insertMarker(0, ReferenceType.Tile, { [reservedTileLabelsKey]: ["pg"] });

			this.root.set("text", text.handle);
			this.root.bindToContext();
		}

		this.root = (await this.runtime.getChannel("root")) as ISharedMap;
		this._text = await this.root.get<IFluidHandle<SharedString>>("text")?.get();
	}
}

/**
 * Factory for creating SmdeDataObjects.
 */
export class SmdeFactory implements IFluidDataStoreFactory {
	public static readonly type = "@fluid-example/smde";
	public readonly type = SmdeFactory.type;

	public get IFluidDataStoreFactory(): IFluidDataStoreFactory {
		return this;
	}

	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<FluidDataStoreRuntime> {
		return new FluidDataStoreRuntime(
			context,
			new Map(
				[SharedMap.getFactory(), SharedString.getFactory()].map((factory) => [
					factory.type,
					factory,
				]),
			),
			existing,
			async (runtime: IFluidDataStoreRuntime) => SmdeDataObject.load(runtime, existing),
		);
	}
}
