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
import {
    IInternalRegistryEntry,
    Templates,
    IComponentInternalRegistry,
    IComponentRegistryTemplates,
} from "@fluid-example/spaces-definitions";

export class InternalRegistry implements IComponentRegistry, IComponentInternalRegistry, IComponentRegistryTemplates {
    public get IComponentRegistry() { return this; }
    public get IComponentInternalRegistry() { return this; }
    public get IComponentRegistryTemplates() {return this; }

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

    public getFromTemplate(template: Templates): IInternalRegistryEntry[] {
        return this.containerComponentArray.filter((componentDetails) =>
            componentDetails.templates[template] !== undefined);
    }
}

const generateRegistryEntries = () => {
    const containerComponentsDefinition: IInternalRegistryEntry[] = [
        {
            type: "clicker",
            factory: Promise.resolve(ClickerInstantiationFactory),
            friendlyName: "Clicker",
            fabricIconName: "Touch",
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
            templates: {},
        },
        {
            type: "codemirror",
            factory: Promise.resolve(cmfe),
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
            friendlyName: "Code",
            fabricIconName: "Code",
            templates: {
                [Templates.CollaborativeCoding]: [{ x: 0, y: 12, w: 26, h: 6 }],
            },
        },
        {
            type: CollaborativeText.ComponentName,
            factory: Promise.resolve(CollaborativeText.getFactory()),
            friendlyName: "Text Box",
            fabricIconName: "Edit",
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
            templates: {
                [Templates.CollaborativeCoding]: [{ x: 26, y: 12, w: 10, h: 6 }],
                [Templates.Classroom]: [{ x: 26, y: 12, w: 10, h: 6 }],
            },
        },
        {
            type: "prosemirror",
            factory: Promise.resolve(pmfe),
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
            friendlyName: "Rich Text",
            fabricIconName: "FabricTextHighlight",
            templates: {
                [Templates.Classroom]: [{ x: 0, y: 12, w: 26, h: 6 }],
            },
        },
    ];

    // Register all of our component options
    const componentRegistryEntries: NamedComponentRegistryEntry[] =
        containerComponentsDefinition.map((definition) => [definition.type, definition.factory]);

    // Register a special entry with empty string which provides the list
    componentRegistryEntries.push(["", Promise.resolve(new InternalRegistry(containerComponentsDefinition))]);

    return componentRegistryEntries;
};

export const spacesInternalRegistryEntries = generateRegistryEntries();
