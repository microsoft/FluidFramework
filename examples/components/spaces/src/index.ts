/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultComponent } from "@microsoft/fluid-aqueduct";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { ClickerInstantiationFactory } from "@fluid-example/clicker";
import {
    IProvideComponentFactory,
    NamedComponentRegistryEntries,
    IComponentRegistry,
} from "@microsoft/fluid-runtime-definitions";
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
import {
    IContainerComponentDetails,
} from "./interfaces";

export * from "./spaces";
export * from "./components";
export * from "./interfaces";

export const SpacesComponentName = "spaces";

export class InternalRegistry implements IComponentRegistry {
    public get IComponentRegistry() { return this; }
    public get IComponentRegistryDetails() { return this; }

    constructor(
        private readonly containerComponentArray: IContainerComponentDetails[],
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

    public getFromCapability(capability: keyof IComponent): IContainerComponentDetails[] {
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

const generateFactory = () => {
    const containerComponentsDefinition: IContainerComponentDetails[] = [
        {
            type: "clicker",
            factory: Promise.resolve(ClickerInstantiationFactory),
            friendlyName: "Clicker",
            fabricIconName: "Touch",
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
        },
        {
            type: ButtonName as string,
            factory: Promise.resolve(Button.getFactory()),
            friendlyName: FriendlyButtonName,
            fabricIconName: "ButtonControl",
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
        },
        {
            type: NumberName as string,
            factory: Promise.resolve(Number.getFactory()),
            friendlyName: FriendlyNumberName,
            fabricIconName: "NumberField",
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
        },
        {
            type: FacePileName as string,
            factory: Promise.resolve(FacePile.getFactory()),
            friendlyName: FriendlyFacePileName,
            fabricIconName: "People",
            capabilities: ["IComponentHTMLView"],
        },
        {
            type: TextBoxName as string,
            factory: Promise.resolve(TextBox.getFactory()),
            friendlyName: FriendlyTextBoxName,
            fabricIconName: "TextField",
            capabilities: ["IComponentHTMLView"],
        },
    ];

    const containerComponents: [string, Promise<IProvideComponentFactory>][] = [];
    containerComponentsDefinition.forEach((value) => {
        containerComponents.push([value.type, value.factory]);
    });

    // We don't want to include the default wrapper component in our list of available components
    containerComponents.push([ SpacesComponentName, Promise.resolve(Spaces.getFactory())]);
    containerComponents.push([ ComponentToolbarName, Promise.resolve(ComponentToolbar.getFactory()) ]);

    const containerRegistries: NamedComponentRegistryEntries = [
        ["", Promise.resolve(new InternalRegistry(containerComponentsDefinition))],
    ];

    // TODO: You should be able to specify the default registry instead of just a list of components
    // and the default registry is already determined Issue:#1138
    return new ContainerRuntimeFactoryWithDefaultComponent(
        SpacesComponentName,
        [
            ...containerComponents,
            ...containerRegistries,
        ],
    );
};

export const fluidExport = generateFactory();
