/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { Serializable } from "@fluidframework/datastore-definitions";
import {
    NamedFluidDataStoreRegistryEntries,
    IFluidDataStoreFactory,
    IFluidDataStoreContext,
} from "@fluidframework/runtime-definitions";
import { ReactViewAdapter } from "@fluidframework/view-adapters";
import { CodeMirrorComponent, CodeMirrorView, SmdeFactory } from "@fluid-example/codemirror";
import { CollaborativeText, CollaborativeTextView } from "@fluid-example/collaborative-textarea";
import { Coordinate } from "@fluid-example/multiview-coordinate-model";
import { SliderCoordinateView } from "@fluid-example/multiview-slider-coordinate-view";
import { ProseMirror, ProseMirrorFactory, ProseMirrorView } from "@fluid-example/prosemirror";
import { Clicker, ClickerInstantiationFactory, ClickerReactView } from "@fluid-example/clicker";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import * as React from "react";
import { Layout } from "react-grid-layout";

const codeMirrorFactory = new SmdeFactory();
const proseMirrorFactory = new ProseMirrorFactory();

interface ISingleHandleItem {
    handle: IFluidHandle;
}

function createSingleHandleItem(subFactory: IFluidDataStoreFactory) {
    return async (context: IFluidDataStoreContext): Promise<ISingleHandleItem> => {
        const packagePath = [...context.packagePath, subFactory.type];
        const router = await context.containerRuntime.createDataStore(packagePath);
        const object = await requestFluidObject<IFluidLoadable>(router, "/");
        return {
            handle: object.handle,
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
    return React.createElement(
        ReactViewAdapter,
        { view: new CodeMirrorView(codeMirror.text, codeMirror.presenceManager) },
    );
};

const getCollaborativeTextView = async (serializableObject: ISingleHandleItem) => {
    const handle = serializableObject.handle as IFluidHandle<CollaborativeText>;
    const collaborativeText = await handle.get();
    return React.createElement(CollaborativeTextView, { text: collaborativeText.text });
};

const getProseMirrorView = async (serializableObject: ISingleHandleItem) => {
    const handle = serializableObject.handle as IFluidHandle<ProseMirror>;
    const proseMirror = await handle.get();
    return React.createElement(
        ReactViewAdapter,
        { view: new ProseMirrorView(proseMirror.collabManager) },
    );
};

const getSliderCoordinateView = async (serializableObject: ISingleHandleItem) => {
    const handle = serializableObject.handle as IFluidHandle<Coordinate>;
    const model = await handle.get();
    return React.createElement(SliderCoordinateView, { label: "Coordinate", model });
};

/**
 * A registry entry, with extra metadata.
 */
export interface ISpacesItemEntry<T = any> {
    // Would be better if items to bring their own subregistries, and their own ability to create components
    // This might be done by integrating these items with the Spaces subcomponent registry?
    create: (context: IFluidDataStoreContext) => Promise<Serializable<T>>;
    getView: (serializableObject: Serializable<T>) => Promise<JSX.Element>;
    friendlyName: string;
    fabricIconName: string;
}

const clickerItemEntry: ISpacesItemEntry<ISingleHandleItem> = {
    create: createSingleHandleItem(ClickerInstantiationFactory),
    getView: getClickerView,
    friendlyName: "Clicker",
    fabricIconName: "Touch",
};

const codemirrorItemEntry: ISpacesItemEntry<ISingleHandleItem> = {
    create: createSingleHandleItem(codeMirrorFactory),
    getView: getCodeMirrorView,
    friendlyName: "Code",
    fabricIconName: "Code",
};

const textboxItemEntry: ISpacesItemEntry<ISingleHandleItem> = {
    create: createSingleHandleItem(CollaborativeText.getFactory()),
    getView: getCollaborativeTextView,
    friendlyName: "Text Box",
    fabricIconName: "Edit",
};

const prosemirrorItemEntry: ISpacesItemEntry<ISingleHandleItem> = {
    create: createSingleHandleItem(proseMirrorFactory),
    getView: getProseMirrorView,
    friendlyName: "Rich Text",
    fabricIconName: "FabricTextHighlight",
};

const sliderCoordinateItemEntry: ISpacesItemEntry<ISingleHandleItem> = {
    create: createSingleHandleItem(Coordinate.getFactory()),
    getView: getSliderCoordinateView,
    friendlyName: "Coordinate",
    fabricIconName: "NumberSymbol",
};

export const spacesItemMap = new Map<string, ISpacesItemEntry>([
    ["clicker", clickerItemEntry],
    ["codemirror", codemirrorItemEntry],
    ["textbox", textboxItemEntry],
    ["prosemirror", prosemirrorItemEntry],
    ["slider-coordinate", sliderCoordinateItemEntry],
]);

// This can go away if the item entries have a way to bring their own subregistries.
export const spacesRegistryEntries: NamedFluidDataStoreRegistryEntries = new Map([
    ClickerInstantiationFactory.registryEntry,
    [codeMirrorFactory.type, Promise.resolve(codeMirrorFactory)],
    [CollaborativeText.Name, Promise.resolve(CollaborativeText.getFactory())],
    [proseMirrorFactory.type, Promise.resolve(proseMirrorFactory)],
    Coordinate.getFactory().registryEntry,
]);

interface ITemplate {
    [type: string]: Layout[];
}

interface ITemplateDictionary {
    [templateName: string]: ITemplate;
}

export const templateDefinitions: ITemplateDictionary = {
    ["Collaborative Coding"]: {
        ["codemirror"]: [{ x: 0, y: 0, w: 26, h: 6 }],
        ["textbox"]: [{ x: 26, y: 0, w: 10, h: 6 }],
    },
    ["Classroom"]: {
        ["textbox"]: [{ x: 26, y: 0, w: 10, h: 6 }],
        ["prosemirror"]: [{ x: 0, y: 0, w: 26, h: 6 }],
    },
};
