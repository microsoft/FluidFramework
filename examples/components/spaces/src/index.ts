/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";

import { ClickerName, ClickerInstantiationFactory } from "@fluid-example/clicker";
import { fluidExport as cmfe } from "@fluid-example/codemirror/dist/codemirror";
import { fluidExport as pmfe } from "@fluid-example/prosemirror/dist/prosemirror";

import {
    ComponentToolbar,
    ComponentToolbarName,
    Button,
    ButtonName,
    Number,
    NumberName,
    TextBox,
    TextBoxName,
    FacePile,
    FacePileName,
    FriendlyButtonName,
    FriendlyNumberName,
    FriendlyFacePileName,
    FriendlyTextBoxName,
} from "./components";
import { Spaces } from "./spaces";
import { IProvideComponentFactory, NamedComponentRegistryEntries, IComponentRegistry, ComponentRegistryEntry } from "@microsoft/fluid-runtime-definitions";

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { SupportedComponent } from "./dataModel";

const componentName = "spaces";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentRegistryDetails>> { }
}

export interface IContainerComponentDetails {
    type: SupportedComponent;
    factory: Promise<IProvideComponentFactory>;
    friendlyName: string;
    fabricIconName: string;
    capabilities: (keyof IComponent)[];
}
export interface IProvideComponentRegistryDetails {
    readonly IComponentRegistryDetails: IComponentRegistryDetails;
}

export interface IComponentRegistryDetails extends IProvideComponentRegistryDetails {
    getFromCapabilities(type: keyof IComponent): IContainerComponentDetails[];
}

export class InternalRegistry implements IComponentRegistry {
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

    public map: Map<string, Promise<ComponentRegistryEntry | undefined>>;
}


const generateFactory = () => {
    const containerComponentsDefinition: IContainerComponentDetails[] = [
        {
            type: ClickerName as SupportedComponent,
            factory: Promise.resolve(ClickerInstantiationFactory),
            friendlyName: "Clicker",
            fabricIconName: "Touch",
            capabilities: ["IComponentHTMLVisual"]
        },
        {
            type: ButtonName as SupportedComponent,
            factory: Promise.resolve(Button.getFactory()),
            friendlyName: FriendlyButtonName,
            fabricIconName: "ButtonControl",
            capabilities: ["IComponentHTMLVisual"]
        },
        {
            type: NumberName as SupportedComponent,
            factory: Promise.resolve(Number.getFactory()),
            friendlyName: FriendlyNumberName,
            fabricIconName: "NumberField",
            capabilities: ["IComponentHTMLVisual"]
        },
        {
            type: FacePileName as SupportedComponent,
            factory: Promise.resolve(FacePile.getFactory()),
            friendlyName: FriendlyFacePileName,
            fabricIconName: "People",
            capabilities: ["IComponentHTMLVisual"]
        },
        {
            type: TextBoxName as SupportedComponent,
            factory: Promise.resolve(TextBox.getFactory()),
            friendlyName: FriendlyTextBoxName,
            fabricIconName: "TextField",
            capabilities: ["IComponentHTMLVisual"]
        },
        {
            type: "codemirror",
            factory: Promise.resolve(cmfe),
            friendlyName: "Code Mirror",
            fabricIconName: "Code",
            capabilities: ["IComponentHTMLVisual"],
        },
        {
            type: "prosemirror",
            factory: Promise.resolve(pmfe),
            friendlyName: "Prose Mirror",
            fabricIconName: "Edit",
            capabilities: ["IComponentHTMLVisual"],
        },
    ];

    const containerComponents: [string, Promise<IProvideComponentFactory>][] = [];
    containerComponentsDefinition.forEach((value) => {
        containerComponents.push([value.type, value.factory]);
    });

    // We don't want to include the default wrapper component in our list of available components
    containerComponents.push([ componentName, Promise.resolve(Spaces.getFactory())]);
    containerComponents.push([ ComponentToolbarName, Promise.resolve(ComponentToolbar.getFactory()) ]);

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
