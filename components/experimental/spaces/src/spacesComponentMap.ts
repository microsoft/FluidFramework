/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentHandle, IComponentLoadable } from "@fluidframework/component-core-interfaces";
import { AsSerializable } from "@fluidframework/component-runtime-definitions";
import { NamedComponentRegistryEntries } from "@fluidframework/runtime-definitions";
import { ReactViewAdapter } from "@fluidframework/view-adapters";
import { fluidExport as cmfe } from "@fluid-example/codemirror/dist/codemirror";
import { CollaborativeText } from "@fluid-example/collaborative-textarea";
import { fluidExport as pmfe } from "@fluid-example/prosemirror/dist/prosemirror";
import { ClickerInstantiationFactory } from "@fluid-example/clicker";

import * as React from "react";
import { Layout } from "react-grid-layout";

export type ICreateAndAttachComponentFunction =
    <T extends IComponent & IComponentLoadable>(pkg: string, props?: any) => Promise<T>;

interface ISingleHandleItem {
    handle: IComponentHandle;
}

const createSingleHandle = (type: string) => {
    return async (createAndAttachComponent: ICreateAndAttachComponentFunction): Promise<ISingleHandleItem> => {
        const component = await createAndAttachComponent(type);
        return {
            handle: component.handle,
        };
    };
};

const getAdaptedViewForHandle = async (serializableObject: ISingleHandleItem) => {
    const handle = serializableObject.handle;
    const component = await handle.get();
    return React.createElement(ReactViewAdapter, { component });
};

/**
 * A registry entry, with extra metadata.
 */
export interface ISpacesItemEntry<T = any> {
    // Would be good for widgets to bring their own subregistries
    // Try not to hand out createAndAttachComponent
    create: (createAndAttachComponent: ICreateAndAttachComponentFunction) => Promise<AsSerializable<T>>;
    // This doesn't actually seem to enforce the param type is serializable in practice.
    getView: (serializableObject: AsSerializable<T>) => Promise<JSX.Element>;
    friendlyName: string;
    fabricIconName: string;
}

const clickerComponentEntry: ISpacesItemEntry<ISingleHandleItem> = {
    create: createSingleHandle(ClickerInstantiationFactory.type),
    getView: getAdaptedViewForHandle,
    friendlyName: "Clicker",
    fabricIconName: "Touch",
};

const codemirrorComponentEntry: ISpacesItemEntry<ISingleHandleItem> = {
    create: createSingleHandle(cmfe.type),
    getView: getAdaptedViewForHandle,
    friendlyName: "Code",
    fabricIconName: "Code",
};

const textboxComponentEntry: ISpacesItemEntry<ISingleHandleItem> = {
    create: createSingleHandle(CollaborativeText.ComponentName),
    getView: getAdaptedViewForHandle,
    friendlyName: "Text Box",
    fabricIconName: "Edit",
};

const prosemirrorComponentEntry: ISpacesItemEntry<ISingleHandleItem> = {
    create: createSingleHandle(pmfe.type),
    getView: getAdaptedViewForHandle,
    friendlyName: "Rich Text",
    fabricIconName: "FabricTextHighlight",
};

export const spacesComponentMap = new Map<string, ISpacesItemEntry>([
    ["clicker", clickerComponentEntry],
    ["codemirror", codemirrorComponentEntry],
    ["textbox", textboxComponentEntry],
    ["prosemirror", prosemirrorComponentEntry],
]);

export const spacesRegistryEntries: NamedComponentRegistryEntries = new Map([
    ClickerInstantiationFactory.registryEntry,
    [cmfe.type, Promise.resolve(cmfe)],
    [CollaborativeText.ComponentName, Promise.resolve(CollaborativeText.getFactory())],
    [pmfe.type, Promise.resolve(pmfe)],
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
