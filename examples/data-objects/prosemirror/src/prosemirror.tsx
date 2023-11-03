/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { EventEmitter } from "events";
import { IFluidLoadable, IFluidHandle, IRequest, IResponse } from "@fluidframework/core-interfaces";
import {
	FluidDataStoreRuntime,
	FluidObjectHandle,
	mixinRequestHandler,
} from "@fluidframework/datastore";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import {
	IMergeTreeInsertMsg,
	ReferenceType,
	reservedRangeLabelsKey,
	MergeTreeDeltaType,
	// eslint-disable-next-line import/no-deprecated
	createMap,
} from "@fluidframework/merge-tree";
import {
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { SharedString } from "@fluidframework/sequence";
import { EditorView } from "prosemirror-view";
import { create404Response } from "@fluidframework/runtime-utils";

import React, { useEffect, useRef } from "react";

import { nodeTypeKey } from "./fluidBridge";
import { FluidCollabManager, IProvideRichTextEditor } from "./fluidCollabManager";

function createTreeMarkerOps(
	treeRangeLabel: string,
	beginMarkerPos: number,
	endMarkerPos: number,
	nodeType: string,
): IMergeTreeInsertMsg[] {
	// eslint-disable-next-line import/no-deprecated
	const endMarkerProps = createMap<any>();
	endMarkerProps[reservedRangeLabelsKey] = [treeRangeLabel];
	endMarkerProps[nodeTypeKey] = nodeType;

	// eslint-disable-next-line import/no-deprecated
	const beginMarkerProps = createMap<any>();
	beginMarkerProps[reservedRangeLabelsKey] = [treeRangeLabel];
	beginMarkerProps[nodeTypeKey] = nodeType;

	return [
		{
			seg: { marker: { refType: ReferenceType.NestBegin }, props: beginMarkerProps },
			pos1: beginMarkerPos,
			type: MergeTreeDeltaType.INSERT,
		},
		{
			seg: { marker: { refType: ReferenceType.NestEnd }, props: endMarkerProps },
			pos1: endMarkerPos,
			type: MergeTreeDeltaType.INSERT,
		},
	];
}

/**
 * ProseMirror builds a Fluid collaborative text editor on top of the open source text editor ProseMirror.
 * It has its own implementation of IFluidLoadable and does not extend PureDataObject / DataObject. This is
 * done intentionally to serve as an example of exposing the URL and handle via IFluidLoadable.
 */
export class ProseMirror extends EventEmitter implements IFluidLoadable, IProvideRichTextEditor {
	public static async load(runtime: IFluidDataStoreRuntime, existing: boolean) {
		const collection = new ProseMirror(runtime);
		await collection.initialize(existing);

		return collection;
	}

	public get handle(): IFluidHandle<this> {
		return this.innerHandle;
	}

	public get IFluidLoadable() {
		return this;
	}

	public get IRichTextEditor() {
		return this._collabManager!;
	}

	public text: SharedString | undefined;
	private root: ISharedMap | undefined;
	private _collabManager: FluidCollabManager | undefined;
	public get collabManager(): FluidCollabManager {
		if (this._collabManager === undefined) {
			throw new Error("Collab manager used before initialized");
		}
		return this._collabManager;
	}
	private readonly innerHandle: IFluidHandle<this>;

	constructor(private readonly runtime: IFluidDataStoreRuntime) {
		super();

		this.innerHandle = new FluidObjectHandle(this, "", runtime.objectsRoutingContext);
	}

	private async initialize(existing: boolean) {
		if (!existing) {
			this.root = SharedMap.create(this.runtime, "root");
			const text = SharedString.create(this.runtime);

			const ops = createTreeMarkerOps("prosemirror", 0, 1, "paragraph");
			text.groupOperation({ ops, type: MergeTreeDeltaType.GROUP });
			text.insertText(1, "Hello, world!");

			this.root.set("text", text.handle);
			this.root.bindToContext();
		}

		this.root = (await this.runtime.getChannel("root")) as ISharedMap;
		this.text = await this.root.get<IFluidHandle<SharedString>>("text")!.get();

		this._collabManager = new FluidCollabManager(this.text);

		// Access for debugging
		// eslint-disable-next-line @typescript-eslint/dot-notation
		window["easyComponent"] = this;
	}

	public async request(req: IRequest): Promise<IResponse> {
		return req.url === "" || req.url === "/" || req.url.startsWith("/?")
			? { mimeType: "fluid/object", status: 200, value: this }
			: create404Response(req);
	}
}

export class ProseMirrorFactory implements IFluidDataStoreFactory {
	public static readonly type = "@fluid-example/prosemirror";
	public readonly type = ProseMirrorFactory.type;

	public get IFluidDataStoreFactory() {
		return this;
	}

	public async instantiateDataStore(context: IFluidDataStoreContext, existing: boolean) {
		// request mixin in
		const runtimeClass = mixinRequestHandler(
			async (request: IRequest, runtimeArg: FluidDataStoreRuntime) => {
				// The provideEntryPoint callback below always returns ProseMirror, so this cast is safe
				const dataObject = (await runtimeArg.entryPoint.get()) as ProseMirror;
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
			async (runtime: IFluidDataStoreRuntime) => ProseMirror.load(runtime, existing),
		);
	}
}

class ProseMirrorView {
	private content: HTMLDivElement | undefined;
	private editorView: EditorView | undefined;
	private textArea: HTMLDivElement | undefined;

	public constructor(private readonly collabManager: FluidCollabManager) {}

	public render(elm: HTMLElement): void {
		// Create base textarea
		if (!this.textArea) {
			this.textArea = document.createElement("div");
			this.textArea.classList.add("editor");
			this.content = document.createElement("div");
			this.content.style.display = "none";
			this.content.innerHTML = "";
		}

		// Reparent if needed
		if (this.textArea.parentElement !== elm) {
			this.textArea.remove();
			this.content!.remove();
			elm.appendChild(this.textArea);
			elm.appendChild(this.content!);
		}

		if (!this.editorView) {
			this.editorView = this.collabManager.setupEditor(this.textArea);
		}
	}

	public remove() {
		// Maybe implement this some time.
	}
}

export interface IProseMirrorReactViewProps {
	readonly collabManager: FluidCollabManager;
}

export const ProseMirrorReactView: React.FC<IProseMirrorReactViewProps> = (
	props: IProseMirrorReactViewProps,
) => {
	const { collabManager } = props;
	const htmlView = useRef<ProseMirrorView>(new ProseMirrorView(collabManager));
	const divRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (divRef.current !== null) {
			htmlView.current.render(divRef.current);
		} else {
			htmlView.current.remove();
		}
	}, [divRef.current]);
	return <div ref={divRef}></div>;
};
