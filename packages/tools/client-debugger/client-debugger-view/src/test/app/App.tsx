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

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import { ITinyliciousAudience } from "@fluidframework/tinylicious-client";

import { CollaborativeTextArea, SharedStringHelper } from "@fluid-experimental/react-inputs";
import { closeFluidClientDebugger } from "@fluid-tools/client-debugger";

import {
	ContainerInfo,
	createFluidContainer,
	initializeFluidClientDebugger,
	loadExistingFluidContainer,
} from "../ClientUtilities";
import { CounterWidget } from "../widgets";

/**
 * Key in the app's `rootMap` under which the SharedString object is stored.
 */
const sharedTextKey = "shared-text";

/**
 * Key in the app's `rootMap` under which the SharedCounter object is stored.
 */
const sharedCounterKey = "shared-counter";

/**
 * Schema used by the app.
 */
const containerSchema: ContainerSchema = {
	initialObjects: {
		rootMap: SharedMap,
	},
	dynamicObjectTypes: [SharedCounter, SharedMap, SharedString],
};

/**
 * Helper function to read the container ID from the URL location.
 */
function getContainerIdFromLocation(location: Location): string {
	return location.hash.slice(1);
}

/**
 * Populate the app's `rootMap` with the desired initial data for use with the client debug view.
 */
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
	// Also set a couple of primitives for testing the debug view
	rootMap.set("numeric-value", 42);
	rootMap.set("string-value", "Hello world!");
	rootMap.set("record-value", {
		aNumber: 37,
		aString: "Here is some text content.",
		anObject: {
			a: "a",
			b: "b",
		},
	});
}

/**
 * React hook for asynchronously creating / loading two Fluid Containers: a shared container whose ID is put in
 * the URL to enable collaboration, and a private container that is only exposed to the local user.
 */
function useContainerInfo(): (ContainerInfo | undefined)[] {
	const [sharedContainerInfo, setSharedContainerInfo] = React.useState<
		ContainerInfo | undefined
	>();
	const [privateContainerInfo, setPrivateContainerInfo] = React.useState<
		ContainerInfo | undefined
	>();

	// Get the Fluid Data data on app startup and store in the state
	React.useEffect(() => {
		async function getFluidData(): Promise<ContainerInfo> {
			let container: IFluidContainer;
			let audience: ITinyliciousAudience;
			let containerId = getContainerIdFromLocation(window.location);
			if (containerId.length === 0) {
				({ container, audience, containerId } = await createFluidContainer(
					containerSchema,
					populateRootMap,
				));
			} else {
				({ container, audience } = await loadExistingFluidContainer(
					containerId,
					containerSchema,
				));
			}

			return { container, audience, containerId };
		}

		getFluidData().then(
			(data) => {
				if (getContainerIdFromLocation(window.location) !== data.containerId) {
					window.location.hash = data.containerId;
				}

				initializeFluidClientDebugger(data);
				setSharedContainerInfo(data);
			},
			(error) => {
				console.error(error);
			},
		);

		async function getPrivateContainerData(): Promise<ContainerInfo> {
			// Always create a new container for the private view.
			// This isn't shared with other collaborators.
			return createFluidContainer(containerSchema, populateRootMap);
		}

		getPrivateContainerData().then(
			(data) => {
				initializeFluidClientDebugger(data);
				setPrivateContainerInfo(data);
			},
			(error) => {
				console.error(error);
			},
		);

		return (): void => {
			if (sharedContainerInfo !== undefined) {
				closeFluidClientDebugger(sharedContainerInfo.containerId);
			}
			if (privateContainerInfo !== undefined) {
				closeFluidClientDebugger(privateContainerInfo.containerId);
			}
		};
	}, []);

	return [sharedContainerInfo, privateContainerInfo];
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

/**
 * Root application component.
 * Initializes the Fluid Container and displays app view once it is ready.
 */
export function App(): React.ReactElement {
	// Load the collaborative SharedString object
	const containers = useContainerInfo();

	if (containers.length !== 2) {
		console.error(
			`Initialization created an unexpected number of containers: ${containers.length}`,
		);
	}

	const view = (
		<Stack horizontal>
			<StackItem>
				{containers[0] === undefined ? (
					<Stack horizontalAlign="center" tokens={{ childrenGap: 10 }}>
						<Spinner />
						<div>Loading Fluid container...</div>
					</Stack>
				) : (
					<AppView containerInfo={containers[0]} />
				)}
			</StackItem>
			<StackItem>
				{containers[1] === undefined ? (
					<Stack horizontalAlign="center" tokens={{ childrenGap: 10 }}>
						<Spinner />
						<div>Loading Fluid container...</div>
					</Stack>
				) : (
					<AppView containerInfo={containers[1]} />
				)}
			</StackItem>
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
	const { container } = containerInfo;

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

	return sharedText === undefined ? (
		<Spinner />
	) : (
		<CollaborativeTextArea sharedStringHelper={new SharedStringHelper(sharedText)} />
	);
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
