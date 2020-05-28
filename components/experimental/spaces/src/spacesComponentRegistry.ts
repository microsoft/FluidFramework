/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@fluidframework/component-core-interfaces";
import {
    IProvideComponentFactory,
    IComponentRegistry,
    NamedComponentRegistryEntry,
} from "@fluidframework/runtime-definitions";
import { fluidExport as cmfe } from "@fluid-example/codemirror/dist/codemirror";
import { CollaborativeText } from "@fluid-example/collaborative-textarea";
import { fluidExport as pmfe } from "@fluid-example/prosemirror/dist/prosemirror";
import { ClickerInstantiationFactory } from "@fluid-example/clicker";
import { Layout } from "react-grid-layout";

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentInternalRegistry>> { }
}

export const IComponentInternalRegistry: keyof IProvideComponentInternalRegistry = "IComponentInternalRegistry";

export interface IProvideComponentInternalRegistry {
    readonly IComponentInternalRegistry: IComponentInternalRegistry;
}

/**
 * Provides functionality to retrieve subsets of an internal registry.
 */
export interface IComponentInternalRegistry extends IProvideComponentInternalRegistry {
    getFromCapability(type: keyof IComponent): IInternalRegistryEntry[];
    hasCapability(type: string, capability: keyof IComponent): boolean;
}

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

export class InternalRegistry implements IComponentRegistry, IComponentInternalRegistry {
    public get IComponentRegistry() { return this; }
    public get IComponentInternalRegistry() { return this; }

    constructor(
        private readonly containerComponentArray: IInternalRegistryEntry[],
    ) {
    }

    public async get(name: string): Promise<Readonly<IProvideComponentFactory> | undefined>
    {
        const index = this.containerComponentArray.findIndex(
            (containerComponent) => name === containerComponent.type,
        );
        if (index >= 0) {
            return this.containerComponentArray[index].factory;
        }

        return undefined;
    }

    public getFromCapability(capability: keyof IComponent): IInternalRegistryEntry[] {
        return this.containerComponentArray.filter((componentDetails) =>
            componentDetails.capabilities.includes(capability));
    }

    public hasCapability(type: string, capability: keyof IComponent) {
        const index = this.containerComponentArray.findIndex(
            (containerComponent) => type === containerComponent.type,
        );
        return index >= 0 && this.containerComponentArray[index].capabilities.includes(capability);
    }
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

    // Register a special entry with empty string which provides the list
    componentRegistryEntries.push(["", Promise.resolve(new InternalRegistry(containerComponentsDefinition))]);

    return componentRegistryEntries;
};

export const spacesInternalRegistryEntries = generateRegistryEntries();

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
