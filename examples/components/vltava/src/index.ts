/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fluidExport as cmfe } from "@fluid-example/codemirror/dist/codemirror";
import { fluidExport as pmfe } from "@fluid-example/prosemirror/dist/prosemirror";
import { ClickerName, ClickerInstantiationFactory } from "@fluid-example/clicker";
import { Spaces } from "@fluid-example/spaces/dist/spaces";

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    IComponentRegistry,
    IProvideComponentFactory,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";

import { TabsComponent } from "./components";
import {
    IComponentRegistryDetails,
    IContainerComponentDetails,
} from "./interfaces";
import { Vltava } from "./vltava";

const componentName = "vltava";

export class InternalRegistry implements IComponentRegistry, IComponentRegistryDetails {
    public get IComponentRegistry() { return this; }
    public get IComponentRegistryDetails() { return this; }

    constructor(
        private readonly containerComponentArray: IContainerComponentDetails[],
    ) {
    }

    public async get(name: string): Promise<Readonly<IProvideComponentFactory>>
    {
        const index = this.containerComponentArray.findIndex(
            (containerComponent) => name === containerComponent.type,
        );
        if (index >= 0){
            return this.containerComponentArray[index].factory;
        }

        return undefined;
    }

    public getFromCapabilities(type: keyof IComponent): IContainerComponentDetails[] {
        return this.containerComponentArray.filter((componentDetails) => componentDetails.capabilities.includes(type));
    }
}

const generateFactory = () => {
    const containerComponentsDefinition: IContainerComponentDetails[] = [
        {
            type: ClickerName,
            factory: Promise.resolve(ClickerInstantiationFactory),
            capabilities: ["IComponentHTMLVisual"],
            friendlyName: "Clicker",
            fabricIconName: "NumberField",
        },
        {
            type: "tabs",
            factory: Promise.resolve(TabsComponent.getFactory()),
            capabilities: ["IComponentHTMLVisual"],
            friendlyName: "Tabs",
            fabricIconName: "BrowserTab",
        },
        {
            type: "spaces",
            factory: Promise.resolve(Spaces.getFactory()),
            capabilities: ["IComponentHTMLVisual"],
            friendlyName: "Spaces",
            fabricIconName: "SnapToGrid",
        },
        {
            type: "codemirror",
            factory: Promise.resolve(cmfe),
            capabilities: ["IComponentHTMLVisual"],
            friendlyName: "Codemirror",
            fabricIconName: "Code",
        },
        {
            type: "prosemirror",
            factory: Promise.resolve(pmfe),
            capabilities: ["IComponentHTMLVisual"],
            friendlyName: "Prosemirror",
            fabricIconName: "Edit",
        },
    ];

    const containerComponents: [string, Promise<IProvideComponentFactory>][] = [];
    containerComponentsDefinition.forEach((value) => {
        containerComponents.push([value.type, value.factory]);
    });

    // We don't want to include the default wrapper component in our list of available components
    containerComponents.push([ componentName, Promise.resolve(Vltava.getFactory())]);

    const containerRegistries: NamedComponentRegistryEntries = [
        ["", Promise.resolve(new InternalRegistry(containerComponentsDefinition))],
    ];

    // TODO: You should be able to specify the default registry instead of just a list of components
    // and the default registry is already determined Issue:#1138
    return new SimpleModuleInstantiationFactory(
        componentName,
        [
            ...containerComponents,
            ...containerRegistries,
        ],
    );
};

export const fluidExport = generateFactory();
