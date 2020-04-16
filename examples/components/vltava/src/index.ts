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
import { BaseContainerRuntimeFactory } from "@microsoft/fluid-aqueduct";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    componentRuntimeRequestHandler,
    RequestParser,
    RuntimeRequestHandler,
} from "@microsoft/fluid-container-runtime";
import { setupLastEditedTrackerForContainer } from "@microsoft/fluid-last-edited-experimental";
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

const defaultComponentId = "default";

// Request handler to handle the request for the default component with an empty URL.
const defaultComponentRuntimeRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IHostRuntime) => {
        if (request.pathParts.length === 0) {
            return componentRuntimeRequestHandler(
                new RequestParser({
                    url: defaultComponentId,
                    headers: request.headers,
                }),
                runtime);
        }
        return undefined;
    };

export class VltavaRuntimeFactory extends BaseContainerRuntimeFactory {
    public static readonly defaultComponentId = defaultComponentId;

    constructor(
        private readonly defaultComponentName: string,
        registryEntries: NamedComponentRegistryEntries,
    ) {
        super(registryEntries, [], [ defaultComponentRuntimeRequestHandler ]);
    }

    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IHostRuntime) {
        // Create the default (Anchor) component.
        const componentRuntime = await runtime.createComponent(
            VltavaRuntimeFactory.defaultComponentId,
            this.defaultComponentName,
        );
        componentRuntime.attach();
    }

    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerHasInitialized}
     */
    protected async containerHasInitialized(runtime: IHostRuntime) {
        // Set up the last edited tracker now that the container has initialized.
        setupLastEditedTrackerForContainer(VltavaRuntimeFactory.defaultComponentId, runtime)
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

    // We don't want to include the default wrapper component in our list of available components
    containerComponents.push([ AnchorName, Promise.resolve(Anchor.getFactory())]);
    containerComponents.push([ VltavaName, Promise.resolve(Vltava.getFactory())]);

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
