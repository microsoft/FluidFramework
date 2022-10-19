/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    Spinner,
    Stack,
    StackItem,
    ThemeProvider,
    createTheme,
    mergeStyles,
} from "@fluentui/react";
import React from "react";

import { ConnectionState } from "@fluidframework/container-loader";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { SharedString } from "@fluidframework/sequence";
import {
    ITinyliciousAudience,
    TinyliciousClient,
    TinyliciousContainerServices,
} from "@fluidframework/tinylicious-client";

import { CollaborativeTextView } from "@fluid-example/collaborative-textarea";

import { SessionDataView } from "../../components";

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

    // Get the Fluid Data data on app startup and store in the state
    React.useEffect(() => {
        async function getFluidData(): Promise<ContainerInfo> {
            /**
             * Type returned from when creating / loading the Container.
             */
            interface ContainerLoadResult {
                container: IFluidContainer;
                services: TinyliciousContainerServices;
            }

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
                console.log("Creating new container...");
                let createContainerResult: ContainerLoadResult;
                try {
                    createContainerResult = await client.createContainer(containerSchema);
                } catch (error) {
                    console.error(`Encountered error creating Fluid container:\n${error}`);
                    throw error;
                }
                console.log("Container created!");

                container = createContainerResult.container;
                services = createContainerResult.services;

                console.log("Awaiting container attach...");
                try {
                    containerId = await container.attach();
                } catch (error) {
                    console.error(`Encountered error attaching Fluid container:\n${error}`);
                    throw error;
                }

                console.log("Fluid container attached!");
            } else {
                console.log("Loading existing container...");
                let getContainerResult: ContainerLoadResult;
                try {
                    getContainerResult = await client.getContainer(containerId, containerSchema);
                } catch (error) {
                    console.error(`Encountered error loading Fluid container:\n${error}`);
                    throw error;
                }
                console.log("Container loaded!");

                container = getContainerResult.container;
                services = getContainerResult.services;

                if (container.connectionState !== ConnectionState.Connected) {
                    console.log("Connecting to container...");
                    await new Promise<void>((resolve) => {
                        container.once("connected", () => {
                            resolve();
                        });
                    });
                    console.log("Connected!");
                }
            }

            return { container, audience: services.audience, containerId };
        }

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
    }, []);

    return containerInfo;
}

const appTheme = createTheme({
    palette: {
        themePrimary: "#0078d4",
        themeLighterAlt: "#eff6fc",
        themeLighter: "#deecf9",
        themeLight: "#c7e0f4",
        themeTertiary: "#71afe5",
        themeSecondary: "#2b88d8",
        themeDarkAlt: "#106ebe",
        themeDark: "#005a9e",
        themeDarker: "#004578",
        neutralLighterAlt: "#faf9f8",
        neutralLighter: "#f3f2f1",
        neutralLight: "#edebe9",
        neutralQuaternaryAlt: "#e1dfdd",
        neutralQuaternary: "#d0d0d0",
        neutralTertiaryAlt: "#c8c6c4",
        neutralTertiary: "#a19f9d",
        neutralSecondary: "#605e5c",
        neutralSecondaryAlt: "#8a8886",
        neutralPrimaryAlt: "#3b3a39",
        neutralPrimary: "#323130",
        neutralDark: "#201f1e",
        black: "#000000",
        white: "#ffffff",
    },
});

const rootStackStyles = mergeStyles({
    height: "100vh",
});

const appViewPaneStackStyles = mergeStyles({
    padding: "5px",
    height: "100%",
    flex: 1,
});

const debuggerViewPaneStackStyles = mergeStyles({
    padding: "5px",
    height: "100%",
});

export function App(): React.ReactElement {
    // Load the collaborative SharedString object
    const containerAndAudience = useContainerInfo();

    let view: React.ReactElement;
    if (containerAndAudience !== undefined) {
        const { container, containerId, audience } = containerAndAudience;
        const sharedString = container.initialObjects.sharedString as SharedString;
        view = (
            <Stack horizontal className={rootStackStyles}>
                <StackItem className={appViewPaneStackStyles}>
                    <CollaborativeTextView text={sharedString} />
                </StackItem>
                <StackItem className={debuggerViewPaneStackStyles}>
                    <SessionDataView
                        container={container}
                        containerId={containerId}
                        audience={audience}
                    />
                </StackItem>
            </Stack>
        );
    } else {
        view = (
            <Stack horizontalAlign="center">
                <Spinner />
                <div>Loading Fluid container...</div>
            </Stack>
        );
    }

    return <ThemeProvider theme={appTheme}>{view}</ThemeProvider>;
}
