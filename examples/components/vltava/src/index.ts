/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fluidExport as cmfe } from "@fluid-example/codemirror/dist/codemirror";
import { fluidExport as pmfe } from "@fluid-example/prosemirror/dist/prosemirror";
import { ClickerInstantiationFactory } from "@fluid-example/clicker";
import {
    Spaces,
    IContainerComponentDetails,
    IComponentRegistryDetails,
} from "@fluid-example/spaces";
import { ContainerRuntimeFactoryWithDefaultComponent } from "@microsoft/fluid-aqueduct";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    LastEditedTrackerComponentName,
    LastEditedTrackerComponent,
    setupLastEditedTrackerForContainer,
} from "@microsoft/fluid-last-edited-experimental";
import {
    IComponentRegistry,
    IHostRuntime,
    IProvideComponentFactory,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";

import {
    Anchor,
    AnchorName,
    TabsComponent,
    Vltava,
    VltavaName,
} from "./components";

// Any component that wants the last edited tracker can request it from the container using this id.
export const LastEditedTrackerId = "last-edited-tracker";

export class InternalRegistry implements IComponentRegistry, IComponentRegistryDetails {
    public get IComponentRegistry() { return this; }
    public get IComponentRegistryDetails() { return this; }

    constructor(
        private readonly containerComponentArray: IContainerComponentDetails[],
    ) {
    }

    public async get(name: string): Promise<Readonly<IProvideComponentFactory | undefined>>
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
        return this.containerComponentArray.filter(
            (componentDetails) =>componentDetails.capabilities.includes(capability));
    }

    public hasCapability(type: string, capability: keyof IComponent) {
        const index = this.containerComponentArray.findIndex(
            (containerComponent) => type === containerComponent.type,
        );
        return index >= 0 && this.containerComponentArray[index].capabilities.includes(capability);
    }
}

export class VltavaRuntimeFactory extends ContainerRuntimeFactoryWithDefaultComponent {
    private readonly lastEditedTrackerId = LastEditedTrackerId;
    constructor(
        defaultComponentName: string,
        registryEntries: NamedComponentRegistryEntries,
    ) {
        super(defaultComponentName, registryEntries);
    }

    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IHostRuntime) {
        // Create the last edited tracker component. This component provides container level tracking of last edit and
        // has to be loaded before any other component.
        const componentRuntime = await runtime.createComponent(
            this.lastEditedTrackerId,
            LastEditedTrackerComponentName,
        );
        componentRuntime.attach();

        // Right now this setup has to be done asynchronously because in the case where we load the Container from
        // remote ops, the `Attach` message for the last edited tracker component has not arrived yet.
        // We should be able to wait here after the create-new workflow is in place.
        setupLastEditedTrackerForContainer(`${this.lastEditedTrackerId}`, runtime)
            .catch((error) => {
                runtime.error(error);
            });

        // Call the super class which will create the default (Anchor) component.
        await super.containerInitializingFirstTime(runtime);
    }

    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFromExisting}
     */
    protected async containerInitializingFromExisting(runtime: IHostRuntime) {
        // Load the last edited tracker component (done by the setup method below). This component provides container
        // level tracking of last edit and has to be loaded before any other component.

        // Right now this setup has to be done asynchronously because in the case where we load the Container from
        // remote ops, the `Attach` message for the last edited tracker component has not arrived yet.
        // We should be able to wait here after the create-new workflow is in place.
        setupLastEditedTrackerForContainer(`${this.lastEditedTrackerId}`, runtime)
            .catch((error) => {
                runtime.error(error);
            });
    }
}

const generateFactory = () => {
    const containerComponentsDefinition: IContainerComponentDetails[] = [
        {
            type: "clicker",
            factory: Promise.resolve(ClickerInstantiationFactory),
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
            friendlyName: "Clicker",
            fabricIconName: "NumberField",
            templates: {},
        },
        {
            type: "tabs",
            factory: Promise.resolve(TabsComponent.getFactory()),
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
            friendlyName: "Tabs",
            fabricIconName: "BrowserTab",
            templates: {},
        },
        {
            type: "spaces",
            factory: Promise.resolve(Spaces.getFactory()),
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
            friendlyName: "Spaces",
            fabricIconName: "SnapToGrid",
            templates: {},
        },
        {
            type: "codemirror",
            factory: Promise.resolve(cmfe),
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
            friendlyName: "Codemirror",
            fabricIconName: "Code",
            templates: {},
        },
        {
            type: "prosemirror",
            factory: Promise.resolve(pmfe),
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
            friendlyName: "Prosemirror",
            fabricIconName: "Edit",
            templates: {},
        },
    ];

    const containerComponents: [string, Promise<IProvideComponentFactory>][] = [];
    containerComponentsDefinition.forEach((value) => {
        containerComponents.push([value.type, value.factory]);
    });

    // The last edited tracker component provides container level tracking of last edits. This is the first
    // component that is loaded.
    containerComponents.push(
        [ LastEditedTrackerComponentName, Promise.resolve(LastEditedTrackerComponent.getFactory()) ]);

    // We don't want to include the default wrapper component in our list of available components
    containerComponents.push([ AnchorName, Promise.resolve(Anchor.getFactory()) ]);
    containerComponents.push([ VltavaName, Promise.resolve(Vltava.getFactory()) ]);

    const containerRegistries: NamedComponentRegistryEntries = [
        ["", Promise.resolve(new InternalRegistry(containerComponentsDefinition))],
    ];

    // TODO: You should be able to specify the default registry instead of just a list of components
    // and the default registry is already determined Issue:#1138
    return new VltavaRuntimeFactory(
        AnchorName,
        [
            ...containerComponents,
            ...containerRegistries,
        ],
    );
};

export const fluidExport = generateFactory();
