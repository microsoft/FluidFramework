/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-internal-modules */

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
import { Vltava } from "./vltava";

const chaincodeName = "vltava";

export class InternalRegistry implements IComponentRegistry {
    public get IComponentRegistry() { return this; }

    constructor(
        public readonly containerComponentArray: IContainerComponent[],
    ) {
    }

    // Note people really shouldn't be requesting things of this probably
    public async get(name: string): Promise<Readonly<IProvideComponentFactory>>
    {
        const index = this.containerComponentArray.findIndex((v) => name === v.type);
        if (index >= 0){
            return this.containerComponentArray[index].factory;
        }

        return undefined;
    }

    public get keys(): string[] {
        const keys: string[] = [];
        this.containerComponentArray.forEach((v) => keys.push(v.type));
        return keys;
    }

    public friendlyName(type: string): string | undefined {
        const index = this.containerComponentArray.findIndex((v) => name === v.type);
        if (index >= 0){
            return this.containerComponentArray[index].friendlyName;
        }

        return undefined;
    }
}

interface IContainerComponent {
    type: string;
    factory: Promise<IProvideComponentFactory>;
    capabilities: (keyof IComponent)[];
    friendlyName: string;
    fabricIconName: string;
}

const containerComponentsDefinition: IContainerComponent[] = [
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

const generateFactory = () => {
    const containerComponents: [string, Promise<IProvideComponentFactory>][] = [];
    containerComponentsDefinition.forEach((value) => {
        containerComponents.push([value.type, value.factory]);
    });

    // We don't want to include the default wrapper component in our list of available components
    containerComponents.push([ chaincodeName, Promise.resolve(Vltava.getFactory())]);

    const containerRegistries: NamedComponentRegistryEntries = [
        ["", Promise.resolve(new InternalRegistry(containerComponentsDefinition))],
    ];

    // TODO: You should be able to specify the default registry instead of just a list of components
    // and the default registry is already determined
    return new SimpleModuleInstantiationFactory(
        chaincodeName,
        [
            ...containerComponents,
            ...containerRegistries,
        ],
    );
};

export const fluidExport = generateFactory();
