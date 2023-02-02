/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { defaultFluidObjectRequestHandler } from "@fluidframework/aqueduct";
import { assert } from "@fluidframework/common-utils";
import {
	IFluidLoadable,
	IFluidRouter,
	IRequest,
	IResponse,
	IFluidHandle,
} from "@fluidframework/core-interfaces";
import { FluidObjectHandle, mixinRequestHandler } from "@fluidframework/datastore";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import {
	MergeTreeDeltaType,
	TextSegment,
	ReferenceType,
	reservedTileLabelsKey,
	Marker,
} from "@fluidframework/merge-tree";
import {
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { getTextAndMarkers, SharedString } from "@fluidframework/sequence";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import SimpleMDE from "simplemde";

// eslint-disable-next-line import/no-internal-modules, import/no-unassigned-import
import "simplemde/dist/simplemde.min.css";

export class Smde extends EventEmitter implements IFluidLoadable, IFluidRouter {
	public static async load(runtime: IFluidDataStoreRuntime, existing: boolean) {
		const smde = new Smde(runtime);
		await smde.initialize(existing);
		smde.setupEditor();

		return smde;
	}

	private readonly innerHandle: IFluidHandle<this>;

	public get handle(): IFluidHandle<this> {
		return this.innerHandle;
	}
	public get IFluidHandle() {
		return this.innerHandle;
	}
	public get IFluidLoadable() {
		return this;
	}

	public get IFluidRouter() {
		return this;
	}

	private root: ISharedMap | undefined;
	private _text: SharedString | undefined;
	public readonly textArea: HTMLTextAreaElement = document.createElement("textarea");
	private smde: SimpleMDE | undefined;

	private get text() {
		assert(!!this._text, "SharedString property missing!");
		return this._text;
	}
	constructor(private readonly runtime: IFluidDataStoreRuntime) {
		super();

		this.innerHandle = new FluidObjectHandle(this, "", this.runtime.objectsRoutingContext);
	}

	public async request(request: IRequest): Promise<IResponse> {
		return defaultFluidObjectRequestHandler(this, request);
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

	private setupEditor() {
		const smde = new SimpleMDE({ element: this.textArea });
		this.smde = smde;

		const { parallelText } = getTextAndMarkers(this.text, "pg");
		const text = parallelText.join("\n");
		this.smde.value(text);

		let localEdit = false;

		this.text.on("sequenceDelta", (ev) => {
			if (ev.isLocal) {
				return;
			}

			localEdit = true;
			for (const range of ev.ranges) {
				const segment = range.segment;

				if (range.operation === MergeTreeDeltaType.INSERT) {
					if (TextSegment.is(segment)) {
						// TODO need to count markers
						smde.codemirror.replaceRange(
							segment.text,
							smde.codemirror.posFromIndex(range.position),
						);
					} else if (Marker.is(segment)) {
						smde.codemirror.replaceRange(
							"\n",
							smde.codemirror.posFromIndex(range.position),
						);
					}
				} else if (range.operation === MergeTreeDeltaType.REMOVE) {
					if (TextSegment.is(segment)) {
						const textSegment = range.segment as TextSegment;
						smde.codemirror.replaceRange(
							"",
							smde.codemirror.posFromIndex(range.position),
							smde.codemirror.posFromIndex(range.position + textSegment.text.length),
						);
					} else if (Marker.is(segment)) {
						smde.codemirror.replaceRange(
							"",
							smde.codemirror.posFromIndex(range.position),
							smde.codemirror.posFromIndex(range.position + 1),
						);
					}
				}
			}
			localEdit = false;
		});

		this.smde.codemirror.on("beforeChange", (instance, changeObj) => {
			if (localEdit) {
				return;
			}

			// We add in line to adjust for paragraph markers
			let from = instance.doc.indexFromPos(changeObj.from);
			const to = instance.doc.indexFromPos(changeObj.to);

			if (from !== to) {
				this.text.removeText(from, to);
			}

			const changedText = changeObj.text as string[];
			changedText.forEach((value, index) => {
				// Insert the updated text
				if (value) {
					this.text.insertText(from, value);
					from += value.length;
				}

				// Add in a paragraph marker if this is a multi-line update
				if (index !== changedText.length - 1) {
					this.text.insertMarker(from, ReferenceType.Tile, {
						[reservedTileLabelsKey]: ["pg"],
					});
					from++;
				}
			});
		});
	}
}

export class SmdeHTMLView implements IFluidHTMLView {
	public constructor(private readonly smde: Smde) { }

	public render(elm: HTMLElement): void {
		// Reparent if needed
		if (this.smde.textArea.parentElement !== elm) {
			this.smde.textArea.remove();
			elm.appendChild(this.smde.textArea);
		}
	}

	public get IFluidHTMLView() {
		return this;
	}
}

export class SmdeFactory implements IFluidDataStoreFactory {
	public static readonly type = "@fluid-example/smde";
	public readonly type = SmdeFactory.type;

	public get IFluidDataStoreFactory() {
		return this;
	}

	public async instantiateDataStore(context: IFluidDataStoreContext, existing: boolean) {
		const runtimeClass = mixinRequestHandler(async (request: IRequest) => {
			const router = await routerP;
			return router.request(request);
		});

		const runtime = new runtimeClass(
			context,
			new Map(
				[SharedMap.getFactory(), SharedString.getFactory()].map((factory) => [
					factory.type,
					factory,
				]),
			),
			existing,
		);
		const routerP = Smde.load(runtime, existing);

		return runtime;
	}
}
