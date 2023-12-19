/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IFluidLoadable, IFluidHandle, IRequest, IResponse } from "@fluidframework/core-interfaces";
import {
	FluidDataStoreRuntime,
	FluidObjectHandle,
	mixinRequestHandler,
} from "@fluidframework/datastore";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import {
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { SharedString, ReferenceType, reservedTileLabelsKey } from "@fluidframework/sequence";
import { create404Response } from "@fluidframework/runtime-utils";

import { PresenceManager } from "./presence";

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

	public async request(req: IRequest): Promise<IResponse> {
		return req.url === "" || req.url === "/" || req.url.startsWith("/?")
			? { mimeType: "fluid/object", status: 200, value: this }
			: create404Response(req);
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
		// request mixin in
		const runtimeClass = mixinRequestHandler(
			async (request: IRequest, runtimeArg: FluidDataStoreRuntime) => {
				// The provideEntryPoint callback below always returns CodeMirrorComponent, so this cast is safe
				const dataObject = (await runtimeArg.entryPoint.get()) as CodeMirrorComponent;
				return dataObject.request?.(request);
			},
			FluidDataStoreRuntime,
		);

		return new runtimeClass(
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
