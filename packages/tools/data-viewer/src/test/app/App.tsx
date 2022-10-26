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
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import {
    ITinyliciousAudience,
    TinyliciousClient,
    TinyliciousContainerServices,
} from "@fluidframework/tinylicious-client";

import { CollaborativeTextView } from "@fluid-example/collaborative-textarea";

import { CounterWidget, SessionDataView } from "../../components";

const sharedTextKey = "shared-text";
const sharedCounterKey = "shared-counter";

const containerSchema: ContainerSchema = {
    initialObjects: {
        rootMap: SharedMap,
    },
    dynamicObjectTypes: [SharedCounter, SharedMap, SharedString],
};

/**
 * Type returned from when creating / loading the Container.
 */
interface ContainerLoadResult {
    container: IFluidContainer;
    services: TinyliciousContainerServices;
}

interface ContainerInfo {
    containerId: string;
    container: IFluidContainer;
    audience: ITinyliciousAudience;
}

function getContainerIdFromLocation(location: Location): string {
    return location.hash.slice(1);
}

async function createNewFluidContainer(client: TinyliciousClient): Promise<ContainerInfo> {
    // Create the container
    console.log("Creating new container...");
    let createContainerResult: ContainerLoadResult;
    try {
        createContainerResult = await client.createContainer(containerSchema);
    } catch (error) {
        console.error(`Encountered error creating Fluid container:\n${error}`);
        throw error;
    }
    console.log("Container created!");

    const { container, services } = createContainerResult;

    // Populate the container with initial app contents (*before* attaching)
    console.log("Populating initial app data...");
    await populateRootMap(container);
    console.log("Initial data populated!");

    // Attach container
    console.log("Awaiting container attach...");
    let containerId: string;
    try {
        containerId = await container.attach();
    } catch (error) {
        console.error(`Encountered error attaching Fluid container:\n${error}`);
        throw error;
    }
    console.log("Fluid container attached!");

    return {
        container,
        containerId,
        audience: services.audience,
    };
}

async function loadExistingFluidContainer(
    client: TinyliciousClient,
    containerId: string,
): Promise<ContainerInfo> {
    console.log("Loading existing container...");
    let getContainerResult: ContainerLoadResult;
    try {
        getContainerResult = await client.getContainer(containerId, containerSchema);
    } catch (error) {
        console.error(`Encountered error loading Fluid container:\n${error}`);
        throw error;
    }
    console.log("Container loaded!");

    const { container, services } = getContainerResult;

    if (container.connectionState !== ConnectionState.Connected) {
        console.log("Connecting to container...");
        await new Promise<void>((resolve) => {
            container.once("connected", () => {
                resolve();
            });
        });
        console.log("Connected!");
    }

    return {
        container,
        containerId,
        audience: services.audience,
    };
}

async function populateRootMap(container: IFluidContainer): Promise<void> {
    const rootMap = container.initialObjects.rootMap as SharedMap;
    if (rootMap === undefined) {
        throw new Error('"rootMap" not found in initialObjects tree.');
    }

    // Set up SharedText for text form
    const sharedText = await container.create(SharedString);
    sharedText.insertText(0, "Enter text here.");
    rootMap.set(sharedTextKey, sharedText.handle);

    // Set up SharedCounter for counter widget
    const sharedCounter = await container.create(SharedCounter);
    rootMap.set(sharedCounterKey, sharedCounter.handle);
}

function useContainerInfo(): ContainerInfo | undefined {
    const [containerInfo, setContainerInfo] = React.useState<ContainerInfo>();

    // Get the Fluid Data data on app startup and store in the state
    React.useEffect(() => {
        async function getFluidData(): Promise<ContainerInfo> {
            const client: TinyliciousClient = new TinyliciousClient();

            let container: IFluidContainer;
            let audience: ITinyliciousAudience;
            let containerId = getContainerIdFromLocation(window.location);
            if (containerId.length === 0) {
                ({ container, audience, containerId } = await createNewFluidContainer(client));
            } else {
                ({ container, audience } = await loadExistingFluidContainer(client, containerId));
            }

            return { container, audience, containerId };
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
    const containerInfo = useContainerInfo();

    const view =
        containerInfo !== undefined ? (
            <AppView containerInfo={containerInfo} />
        ) : (
            <Stack horizontalAlign="center">
                <Spinner />
                <div>Loading Fluid container...</div>
            </Stack>
        );

    return <ThemeProvider theme={appTheme}>{view}</ThemeProvider>;
}

/**
 * {@link AppView} input props.
 */
interface AppViewProps {
    containerInfo: ContainerInfo;
}

/**
 * Inner app view.
 *
 * @remarks Valid to display once the container has been created / loaded.
 */
function AppView(props: AppViewProps): React.ReactElement {
    const { containerInfo } = props;
    const { container, containerId, audience } = containerInfo;

    const rootMap = container.initialObjects.rootMap as SharedMap;
    if (rootMap === undefined) {
        throw new Error('"rootMap" not found in initialObjects tree.');
    }

    const sharedTextHandle = rootMap.get(sharedTextKey) as IFluidHandle<SharedString>;
    if (sharedTextHandle === undefined) {
        throw new Error(`"${sharedTextKey}" entry not found in rootMap.`);
    }

    const sharedCounterHandle = rootMap.get(sharedCounterKey) as IFluidHandle<SharedCounter>;
    if (sharedCounterHandle === undefined) {
        throw new Error(`"${sharedCounterKey}" entry not found in rootMap.`);
    }

    return (
        <Stack horizontal className={rootStackStyles}>
            <StackItem className={appViewPaneStackStyles}>
                <Stack>
                    <StackItem>
                        <CounterView sharedCounterHandle={sharedCounterHandle} />
                    </StackItem>
                    <StackItem>
                        <TextView sharedTextHandle={sharedTextHandle} />
                    </StackItem>
                </Stack>
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
}

interface TextViewProps {
    sharedTextHandle: IFluidHandle<SharedString>;
}

function TextView(props: TextViewProps): React.ReactElement {
    const { sharedTextHandle } = props;

    const [sharedText, setSharedText] = React.useState<SharedString | undefined>();

    React.useEffect(() => {
        sharedTextHandle.get().then(setSharedText, (error) => {
            console.error(`Error encountered loading SharedString: "${error}".`);
            throw error;
        });
    }, [sharedTextHandle, setSharedText]);

    return sharedText === undefined ? <Spinner /> : <CollaborativeTextView text={sharedText} />;
}

interface CounterViewProps {
    sharedCounterHandle: IFluidHandle<SharedCounter>;
}

function CounterView(props: CounterViewProps): React.ReactElement {
    const { sharedCounterHandle } = props;

    const [sharedCounter, setSharedCounter] = React.useState<SharedCounter | undefined>();

    React.useEffect(() => {
        sharedCounterHandle.get().then(setSharedCounter, (error) => {
            console.error(`Error encountered loading SharedCounter: "${error}".`);
            throw error;
        });
    }, [sharedCounterHandle, setSharedCounter]);

    return sharedCounter === undefined ? <Spinner /> : <CounterWidget counter={sharedCounter} />;
}
