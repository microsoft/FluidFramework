/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { ConnectionState, ContainerSchema, IFluidContainer, SharedString } from "fluid-framework";

import {
    ITinyliciousAudience,
    TinyliciousClient,
    TinyliciousContainerServices,
} from "@fluidframework/tinylicious-client";

import { SessionDataView } from "../../components";
import "./App.css";

interface ContainerInfo {
    containerId: string;
    container: IFluidContainer;
    audience: ITinyliciousAudience;
}

function useContainerInfo(): ContainerInfo | undefined {
    const [containerInfo, setContainerInfo] = React.useState<ContainerInfo>();

    async function getFluidData(): Promise<ContainerInfo> {
        // Configure the container.
        const client: TinyliciousClient = new TinyliciousClient();
        const containerSchema: ContainerSchema = {
            initialObjects: { sharedString: SharedString },
        };

        // Get the container from the Fluid service.
        let container: IFluidContainer;
        let services: TinyliciousContainerServices;
        const containerId = window.location.hash.substring(1);
        if (containerId.length === 0) {
            const createContainerResult = await client.createContainer(containerSchema);
            container = createContainerResult.container;
            services = createContainerResult.services;

            const containerId = await container.attach();
            window.location.hash = containerId;
        } else {
            const getContainerResult = await client.getContainer(containerId, containerSchema);
            container = getContainerResult.container;
            services = getContainerResult.services;

            if (container.connectionState !== ConnectionState.Connected) {
                await new Promise<void>((resolve) => {
                    container.once("connected", () => {
                        resolve();
                    });
                });
            }
        }

        return { container, audience: services.audience, containerId };
    }

    // Get the Fluid Data data on app startup and store in the state
    React.useEffect(() => {
        getFluidData().then((data) => setContainerInfo(data));
    });

    return containerInfo;
}

function App() {
    // Load the collaborative SharedString object
    const containerAndAudience = useContainerInfo();

    // Create the view using CollaborativeTextArea & SharedStringHelper
    if (containerAndAudience !== undefined) {
        const { container, containerId, audience } = containerAndAudience;
        return (
            <div className="app">
                <SessionDataView
                    container={container}
                    containerId={containerId}
                    audience={audience}
                />
            </div>
        );
    } else {
        return <div />;
    }
}

export default App;
