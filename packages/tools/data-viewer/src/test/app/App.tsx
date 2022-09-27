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
// eslint-disable-next-line import/no-unassigned-import
import "./App.css";

interface ContainerInfo {
    containerId: string;
    container: IFluidContainer;
    audience: ITinyliciousAudience;
}

function getContainerIdFromLocation(location: Location): string {
    return location.hash.slice(1);
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
        let containerId = getContainerIdFromLocation(window.location);
        if (containerId.length === 0) {
            const createContainerResult = await client.createContainer(containerSchema);
            container = createContainerResult.container;
            services = createContainerResult.services;
            containerId = await container.attach();
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
        getFluidData().then(
            (data) => {
                setContainerInfo(data);
                if (getContainerIdFromLocation(window.location) !== data.containerId) {
                    window.location.hash = data.containerId;
                }
            },
            (error) => {
                throw error;
            },
        );
    });

    return containerInfo;
}

export function App(): React.ReactElement {
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
        return <div>Loading Fluid container...</div>;
    }
}
