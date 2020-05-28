/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@fluidframework/component-core-interfaces";
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
export interface IInternalRegistryEntry {
    type: string;
    factory: Promise<IProvideComponentFactory>;
    capabilities: (keyof IComponent)[];
    friendlyName: string;
    fabricIconName: string;
}

const clickerRegistryEntry: IInternalRegistryEntry = {
    type: "clicker",
    factory: Promise.resolve(ClickerInstantiationFactory),
    friendlyName: "Clicker",
    fabricIconName: "Touch",
    capabilities: ["IComponentHTMLView", "IComponentLoadable"],
};

const codemirrorRegistryEntry: IInternalRegistryEntry = {
    type: "codemirror",
    factory: Promise.resolve(cmfe),
    capabilities: ["IComponentHTMLView", "IComponentLoadable"],
    friendlyName: "Code",
    fabricIconName: "Code",
};

const textboxRegistryEntry: IInternalRegistryEntry = {
    type: "textbox",
    factory: Promise.resolve(CollaborativeText.getFactory()),
    friendlyName: "Text Box",
    fabricIconName: "Edit",
    capabilities: ["IComponentHTMLView", "IComponentLoadable"],
};

const prosemirrorRegistryEntry: IInternalRegistryEntry = {
    type: "prosemirror",
    factory: Promise.resolve(pmfe),
    capabilities: ["IComponentHTMLView", "IComponentLoadable"],
    friendlyName: "Rich Text",
    fabricIconName: "FabricTextHighlight",
};

const generateRegistryEntries = () => {
    const containerComponentsDefinition: IInternalRegistryEntry[] = [
        clickerRegistryEntry,
        codemirrorRegistryEntry,
        textboxRegistryEntry,
        prosemirrorRegistryEntry,
    ];

    // Register all of our component options
    const componentRegistryEntries: NamedComponentRegistryEntry[] =
        containerComponentsDefinition.map((definition) => [definition.type, definition.factory]);

    return componentRegistryEntries;
};

export const spacesRegistryEntries = generateRegistryEntries();

export const spacesComponentMap = new Map<string, IInternalRegistryEntry>([
    ["clicker", clickerRegistryEntry],
    ["codemirror", codemirrorRegistryEntry],
    ["textbox", textboxRegistryEntry],
    ["prosemirror", prosemirrorRegistryEntry],
]);

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
