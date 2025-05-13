/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Clicker,
	ClickerInstantiationFactory,
	ClickerReactView,
} from "@fluid-example/clicker";
import {
	CodeMirrorComponent,
	CodeMirrorReactView,
	SmdeFactory,
} from "@fluid-example/codemirror";
import {
	CollaborativeText,
	CollaborativeTextView,
} from "@fluid-example/collaborative-textarea";
import { Coordinate } from "@fluid-example/multiview-coordinate-model";
import { SliderCoordinateView } from "@fluid-example/multiview-slider-coordinate-view";
import {
	ProseMirror,
	ProseMirrorFactory,
	ProseMirrorReactView,
} from "@fluid-example/prosemirror";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { Serializable } from "@fluidframework/datastore-definitions/legacy";
import {
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/legacy";
import * as React from "react";

const codeMirrorFactory = new SmdeFactory();
const proseMirrorFactory = new ProseMirrorFactory();

interface ISingleHandleItem {
	handle: IFluidHandle;
}

function createSingleHandleItem(subFactory: IFluidDataStoreFactory) {
	return async (context: IFluidDataStoreContext): Promise<ISingleHandleItem> => {
		const packagePath = [...context.packagePath, subFactory.type];
		const dataStore = await context.containerRuntime.createDataStore(packagePath);
		return {
			handle: dataStore.entryPoint as IFluidHandle,
		};
	};
}

const getClickerView = async (serializableObject: ISingleHandleItem) => {
	const handle = serializableObject.handle as IFluidHandle<Clicker>;
	const clicker = await handle.get();
	return React.createElement(ClickerReactView, { clicker });
};

const getCodeMirrorView = async (serializableObject: ISingleHandleItem) => {
	const handle = serializableObject.handle as IFluidHandle<CodeMirrorComponent>;
	const codeMirror = await handle.get();
	return React.createElement(CodeMirrorReactView, {
		text: codeMirror.text,
		presenceManager: codeMirror.presenceManager,
	});
};

const getCollaborativeTextView = async (serializableObject: ISingleHandleItem) => {
	const handle = serializableObject.handle as IFluidHandle<CollaborativeText>;
	const collaborativeText = await handle.get();
	return React.createElement(CollaborativeTextView, { text: collaborativeText.text });
};

const getProseMirrorView = async (serializableObject: ISingleHandleItem) => {
	const handle = serializableObject.handle as IFluidHandle<ProseMirror>;
	const proseMirror = await handle.get();
	return React.createElement(ProseMirrorReactView, {
		collabManager: proseMirror.collabManager,
	});
};

const getSliderCoordinateView = async (serializableObject: ISingleHandleItem) => {
	const handle = serializableObject.handle as IFluidHandle<Coordinate>;
	const model = await handle.get();
	return React.createElement(SliderCoordinateView, { label: "Coordinate", model });
};

/**
 * A registry entry, with extra metadata.
 */
export interface IDataObjectGridItemEntry<T = any> {
	// Would be better if items to bring their own subregistries, and their own ability to create components
	// This might be done by integrating these items with the data grid subcomponent registry?
	create: (context: IFluidDataStoreContext) => Promise<Serializable<T>>;
	getView: (serializableObject: Serializable<T>) => Promise<JSX.Element>;
	friendlyName: string;
	fabricIconName: string;
}

const clickerItemEntry: IDataObjectGridItemEntry<ISingleHandleItem> = {
	create: createSingleHandleItem(ClickerInstantiationFactory),
	getView: getClickerView,
	friendlyName: "Clicker",
	fabricIconName: "Touch",
};

const codemirrorItemEntry: IDataObjectGridItemEntry<ISingleHandleItem> = {
	create: createSingleHandleItem(codeMirrorFactory),
	getView: getCodeMirrorView,
	friendlyName: "Code",
	fabricIconName: "Code",
};

const textboxItemEntry: IDataObjectGridItemEntry<ISingleHandleItem> = {
	create: createSingleHandleItem(CollaborativeText.getFactory()),
	getView: getCollaborativeTextView,
	friendlyName: "Text Box",
	fabricIconName: "Edit",
};

const prosemirrorItemEntry: IDataObjectGridItemEntry<ISingleHandleItem> = {
	create: createSingleHandleItem(proseMirrorFactory),
	getView: getProseMirrorView,
	friendlyName: "Rich Text",
	fabricIconName: "FabricTextHighlight",
};

const sliderCoordinateItemEntry: IDataObjectGridItemEntry<ISingleHandleItem> = {
	create: createSingleHandleItem(Coordinate.getFactory()),
	getView: getSliderCoordinateView,
	friendlyName: "Coordinate",
	fabricIconName: "NumberSymbol",
};

/**
 * The registry for our app, containing the options for data objects that can be inserted into the grid.
 */
export const dataObjectRegistry = new Map<string, IDataObjectGridItemEntry>([
	["clicker", clickerItemEntry],
	["codemirror", codemirrorItemEntry],
	["textbox", textboxItemEntry],
	["prosemirror", prosemirrorItemEntry],
	["slider-coordinate", sliderCoordinateItemEntry],
]);

/**
 * The registry entries the container runtime will use to instantiate the data stores.
 *
 * @remarks This can go away if the item entries have a way to bring their own subregistries.
 */
export const registryEntries: NamedFluidDataStoreRegistryEntries = new Map([
	ClickerInstantiationFactory.registryEntry,
	[codeMirrorFactory.type, Promise.resolve(codeMirrorFactory)],
	[CollaborativeText.Name, Promise.resolve(CollaborativeText.getFactory())],
	[proseMirrorFactory.type, Promise.resolve(proseMirrorFactory)],
	Coordinate.getFactory().registryEntry,
]);
