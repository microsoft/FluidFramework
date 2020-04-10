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
<<<<<<< HEAD
import { ContainerRuntimeFactoryWithDefaultComponent } from "@microsoft/fluid-aqueduct";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
=======
import { IComponent, IRequest } from "@microsoft/fluid-component-core-interfaces";
import {
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
} from "@microsoft/fluid-container-definitions";
import { ContainerRuntime } from "@microsoft/fluid-container-runtime";
import { setupLastEditedTracker } from "@microsoft/fluid-last-edited";
import { ISequencedDocumentMessage, MessageType } from "@microsoft/fluid-protocol-definitions";
>>>>>>> AqueductAnchor -> LastEditedTracker. Changed it to a class, added setup helper. Updated Vtlava to demonstrate LastEditedTracker.
import {
    IComponentRegistry,
    IHostRuntime,
    IEnvelope,
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
import { LastEditedViewer } from "./components/last-edited";

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
        if (index >= 0){
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

export class VltavaRuntimeFactory implements IRuntimeFactory {
    public static readonly defaultComponentId = "default";
    constructor(
        private readonly defaultComponentName: string,
        private readonly registryEntries: NamedComponentRegistryEntries) {}

    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const runtime = await ContainerRuntime.load(
            context,
            this.registryEntries,
            [this.componentRuntimeRequestHandler],
            { generateSummaries: true });

        // On first boot create the root component
        if (!runtime.existing) {
            await runtime.createComponent(VltavaRuntimeFactory.defaultComponentId, this.defaultComponentName)
                .then((componentRuntime) => {
                    componentRuntime.attach();
                }).catch((error) => {
                    context.error(error);
                });
        }

        setupLastEditedTracker(VltavaRuntimeFactory.defaultComponentId, runtime, this.shouldDiscardMessage)
            .catch((error) => {
                throw error;
            });

        return runtime;
    }

    private async componentRuntimeRequestHandler(request: IRequest, runtime: IHostRuntime) {
        const requestUrl = request.url.length > 0 && request.url.startsWith("/")
            ? request.url.substr(1)
            : request.url;
        const trailingSlash = requestUrl.indexOf("/");

        const componentId = requestUrl
            ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
            : VltavaRuntimeFactory.defaultComponentId;
        const component = await runtime.getComponentRuntime(componentId, true);

        return component.request({ url: trailingSlash === -1 ? "" : requestUrl.substr(trailingSlash + 1) });
    }

    private shouldDiscardMessage(message: ISequencedDocumentMessage): boolean {
        const envelope = message.contents as IEnvelope;
        if ((message.type !== MessageType.Operation) || envelope.address.includes("_scheduler")) {
            return true;
        }
        return false;
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
        },
        {
            type: "tabs",
            factory: Promise.resolve(TabsComponent.getFactory()),
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
            friendlyName: "Tabs",
            fabricIconName: "BrowserTab",
        },
        {
            type: "spaces",
            factory: Promise.resolve(Spaces.getFactory()),
            capabilities: ["IComponentHTMLView", "IComponentLoadable"],
            friendlyName: "Spaces",
            fabricIconName: "SnapToGrid",
        },
        {
            type: "codemirror",
            factory: Promise.resolve(cmfe),
            capabilities: ["IComponentHTMLView"],
            friendlyName: "Codemirror",
            fabricIconName: "Code",
        },
        {
            type: "prosemirror",
            factory: Promise.resolve(pmfe),
            capabilities: ["IComponentHTMLView"],
            friendlyName: "Prosemirror",
            fabricIconName: "Edit",
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
    return new ContainerRuntimeFactoryWithDefaultComponent(
        "anchor",
        [
            ...containerComponents,
            ...containerRegistries,
        ],
    );
};

export const fluidExport = generateFactory();
