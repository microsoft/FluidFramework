/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultComponent } from "@microsoft/fluid-aqueduct";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    IProvideComponentFactory,
    NamedComponentRegistryEntries,
    IComponentRegistry,
} from "@microsoft/fluid-runtime-definitions";
import { fluidExport as cmfe } from "@fluid-example/codemirror/dist/codemirror";
import { fluidExport as pmfe } from "@fluid-example/prosemirror/dist/prosemirror";
import { Chat } from "@fluid-example/chat/src/main";
import { ClickerInstantiationFactory } from "@fluid-example/clicker";
import {
    ComponentToolbar,
    ComponentToolbarName,
    TextBox,
    TextBoxName,
    FriendlyTextBoxName,
} from "./components";
import { Spaces } from "./spaces";
import {
    IContainerComponentDetails, Templates,
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
        if (index >= 0){
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

    public getFromTemplate(template: Templates): IContainerComponentDetails[] {
        return this.containerComponentArray.filter((componentDetails) =>
            componentDetails.templates[template] !== undefined);
    }
}

const generateFactory = () => {
    const containerComponentsDefinition: IContainerComponentDetails[] = [
        {
            type: "chat",
            factory: Promise.resolve(Chat.getFactory()),
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
            friendlyName: "Chat",
            fabricIconName: "ChatInviteFriend",
            templates: {
                [Templates.CollaborativeCoding]: [{ x: 26, y: 0, w: 10, h: 12 }],
                [Templates.Classroom]: [{ x: 26, y: 0, w: 10, h: 12 }],
            },
        },
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
            type: TextBoxName as string,
            factory: Promise.resolve(TextBox.getFactory()),
            friendlyName: FriendlyTextBoxName,
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
