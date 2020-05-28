/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IProvideComponentFactory,
    NamedComponentRegistryEntry,
} from "@fluidframework/runtime-definitions";
import { fluidExport as cmfe } from "@fluid-example/codemirror/dist/codemirror";
import { CollaborativeText } from "@fluid-example/collaborative-textarea";
import { fluidExport as pmfe } from "@fluid-example/prosemirror/dist/prosemirror";
import { ClickerInstantiationFactory } from "@fluid-example/clicker";
import { Layout } from "react-grid-layout";

/**
 * A registry entry, with extra metadata.
 */
export interface ISpacesComponentEntry {
    factory: Promise<IProvideComponentFactory>;
    friendlyName: string;
    fabricIconName: string;
}

const clickerComponentEntry: ISpacesComponentEntry = {
    factory: Promise.resolve(ClickerInstantiationFactory),
    friendlyName: "Clicker",
    fabricIconName: "Touch",
};

const codemirrorComponentEntry: ISpacesComponentEntry = {
    factory: Promise.resolve(cmfe),
    friendlyName: "Code",
    fabricIconName: "Code",
};

const textboxComponentEntry: ISpacesComponentEntry = {
    factory: Promise.resolve(CollaborativeText.getFactory()),
    friendlyName: "Text Box",
    fabricIconName: "Edit",
};

const prosemirrorComponentEntry: ISpacesComponentEntry = {
    factory: Promise.resolve(pmfe),
    friendlyName: "Rich Text",
    fabricIconName: "FabricTextHighlight",
};

export const spacesComponentMap = new Map<string, ISpacesComponentEntry>([
    ["clicker", clickerComponentEntry],
    ["codemirror", codemirrorComponentEntry],
    ["textbox", textboxComponentEntry],
    ["prosemirror", prosemirrorComponentEntry],
]);

export const spacesRegistryEntries: NamedComponentRegistryEntry[] = Array.from(
    spacesComponentMap.entries(),
    ([type, componentEntry]) => [type, componentEntry.factory],
);

interface ITemplate {
    [widgetType: string]: Layout[];
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
