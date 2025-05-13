/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "@fluid-example/example-utils";
import { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime, FluidObjectHandle } from "@fluidframework/datastore/legacy";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/legacy";
import { ISharedMap, SharedMap } from "@fluidframework/map/legacy";
import {
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions/legacy";
// eslint-disable-next-line import/no-internal-modules -- #26904: `sequence` internals used in examples
import { reservedTileLabelsKey } from "@fluidframework/sequence/internal";
import { ReferenceType, SharedString } from "@fluidframework/sequence/legacy";

import { PresenceManager } from "./presence.js";

/**
 * CodeMirrorComponent builds a Fluid collaborative code editor on top of the open source code editor CodeMirror.
 * It has its own implementation of IFluidLoadable and does not extend PureDataObject / DataObject. This is
 * done intentionally to serve as an example of exposing the URL and handle via IFluidLoadable.
 * @internal
 */
export class CodeMirrorComponent extends EventEmitter implements IFluidLoadable {
	public static async load(runtime: IFluidDataStoreRuntime, existing: boolean) {
		const collection = new CodeMirrorComponent(runtime);
		await collection.initialize(existing);

		return collection;
	}

	public get IFluidLoadable() {
		return this;
	}

	public get handle(): IFluidHandle<this> {
		return this.innerHandle;
	}

	private _text: SharedString | undefined;
	public get text(): SharedString {
		if (this._text === undefined) {
			throw new Error("Text used before initialized");
		}
		return this._text;
	}
	private root: ISharedMap | undefined;
	private readonly innerHandle: IFluidHandle<this>;

	public readonly presenceManager: PresenceManager;

	constructor(private readonly runtime: IFluidDataStoreRuntime) {
		super();
		this.innerHandle = new FluidObjectHandle(this, "", runtime.objectsRoutingContext);
		this.presenceManager = new PresenceManager(runtime);
	}

	private async initialize(existing: boolean) {
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
 * @internal
 */
export class SmdeFactory implements IFluidDataStoreFactory {
	public static readonly type = "@fluid-example/codemirror";
	public readonly type = SmdeFactory.type;

	public get IFluidDataStoreFactory() {
		return this;
	}

	public async instantiateDataStore(context: IFluidDataStoreContext, existing: boolean) {
		return new FluidDataStoreRuntime(
			context,
			new Map(
				[SharedMap.getFactory(), SharedString.getFactory()].map((factory) => [
					factory.type,
					factory,
				]),
			),
			existing,
			async (runtime: IFluidDataStoreRuntime) => CodeMirrorComponent.load(runtime, existing),
		);
	}
}
