/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    IProvideComponentFactory,
    NamedComponentRegistryEntries,
    IComponentRegistry,
} from "@microsoft/fluid-runtime-definitions";
import { fluidExport as cmfe } from "@fluid-example/codemirror/dist/codemirror";
import { fluidExport as pmfe } from "@fluid-example/prosemirror/dist/prosemirror";
import { MediaPlayer } from "../../media-player/src/main";
import { LocationSharing } from "../../location-sharing/src/main";
import { Chat } from "../../chat/src/index";
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

    public getFromCapabilities(type: keyof IComponent): IContainerComponentDetails[] {
        return this.containerComponentArray.filter((componentDetails) => componentDetails.capabilities.includes(type));
    }

    public getFromTemplate(template: Templates): IContainerComponentDetails[] {
        return this.containerComponentArray.filter((componentDetails) =>
            componentDetails.templates[template] !== undefined);
    }
}

const generateFactory = () => {
    const containerComponentsDefinition: IContainerComponentDetails[] = [
        {
            type: "media-player",
            factory: Promise.resolve(MediaPlayer.getFactory()),
            friendlyName: "Media Player",
            fabricIconName: "Media",
            capabilities: ["IComponentHTMLView"],
            templates: {
                [Templates.CollaborativeCoding]: { x: 0, y: 0, w: 6, h: 2 },
                [Templates.MediaRoom]: { x: 0, y: 0, w: 6, h: 2 },
                [Templates.CovidStarterKit]: { x: 0, y: 0, w: 6, h: 2 },
                [Templates.Classroom]: { x: 0, y: 0, w: 6, h: 2 },
            },
        },
        {
            type: "chat",
            factory: Promise.resolve(Chat.getFactory()),
            capabilities: ["IComponentHTMLView"],
            friendlyName: "Chat",
            fabricIconName: "ChatInviteFriend",
            templates: {
                [Templates.CollaborativeCoding]: { x: 0, y: 0, w: 6, h: 2 },
                [Templates.MediaRoom]: { x: 0, y: 0, w: 6, h: 2 },
                [Templates.CovidStarterKit]: { x: 0, y: 0, w: 6, h: 2 },
                [Templates.Classroom]: { x: 0, y: 0, w: 6, h: 2 },
            },
        },
        {
            type: "location",
            factory: Promise.resolve(LocationSharing.getFactory()),
            capabilities: ["IComponentHTMLView"],
            friendlyName: "Location Sharing",
            fabricIconName: "Location",
            templates: {
                [Templates.CovidStarterKit]: { x: 0, y: 0, w: 6, h: 2 },
            },
        },
        {
            type: "codemirror",
            factory: Promise.resolve(cmfe),
            capabilities: ["IComponentHTMLView"],
            friendlyName: "Code",
            fabricIconName: "Code",
            templates: {
                [Templates.CollaborativeCoding]: { x: 0, y: 0, w: 6, h: 2 },
            },
        },
        {
            type: TextBoxName as string,
            factory: Promise.resolve(TextBox.getFactory()),
            friendlyName: FriendlyTextBoxName,
            fabricIconName: "Edit",
            capabilities: ["IComponentHTMLView"],
            templates: {
                [Templates.CollaborativeCoding]: { x: 0, y: 0, w: 6, h: 2 },
                [Templates.Classroom]: { x: 0, y: 0, w: 6, h: 2 },
            },
        },
        {
            type: "prosemirror",
            factory: Promise.resolve(pmfe),
            capabilities: ["IComponentHTMLView"],
            friendlyName: "Rich Text",
            fabricIconName: "FabricTextHighlight",
            templates: {
                [Templates.Classroom]: { x: 0, y: 0, w: 6, h: 2 },
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
    return new SimpleModuleInstantiationFactory(
        SpacesComponentName,
        [
            ...containerComponents,
            ...containerRegistries,
        ],
    );
};

export const fluidExport = generateFactory();
