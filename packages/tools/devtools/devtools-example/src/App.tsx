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

import { ContainerKey, HasContainerKey } from "@fluid-experimental/devtools-core";
import { DevtoolsLogger, IDevtools, initializeDevtools } from "@fluid-experimental/devtools";
import { CollaborativeTextArea, SharedStringHelper } from "@fluid-experimental/react-inputs";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { SharedCell } from "@fluidframework/cell";
import { SharedMap } from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { SharedString } from "@fluidframework/sequence";

import { ContainerInfo, createFluidContainer, loadExistingFluidContainer } from "./ClientUtilities";
import { CounterWidget, EmojiGrid } from "./widgets";

const sharedContainerKey: ContainerKey = "Shared Container";
const privateContainerKey: ContainerKey = "Private Container";

/**
 * Key in the app's `rootMap` under which the SharedString object is stored.
 */
const sharedTextKey = "shared-text";

/**
 * Key in the app's `rootMap` under which the SharedCounter object is stored.
 */
const sharedCounterKey = "shared-counter";

/**
 * Key in the app's `rootMap` under which the SharedCell object is stored.
 */
const emojiMatrixKey = "emoji-matrix";

/**
 * Schema used by the app.
 */
const containerSchema: ContainerSchema = {
	initialObjects: {
		rootMap: SharedMap,
	},
	dynamicObjectTypes: [SharedCell, SharedCounter, SharedMap, SharedMatrix, SharedString],
};

/**
 * Helper function to read the Container ID from the URL location.
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

	// Set up SharedMatrix of SharedCell_s for emoji grid
	const emojiMatrix = await container.create(SharedMatrix);
	const matrixDimension = 2; // Height and Width
	emojiMatrix.insertRows(0, matrixDimension);
	emojiMatrix.insertCols(0, matrixDimension);
	for (let row = 0; row < matrixDimension; row++) {
		for (let col = 0; col < matrixDimension; col++) {
			const emojiCell = await container.create(SharedCell);
			emojiMatrix.setCell(row, col, emojiCell.handle);
		}
	}

	rootMap.set(emojiMatrixKey, emojiMatrix.handle);

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
 * Registers container described by the input `containerInfo` with the provided devtools instance.
 */
function registerContainerWithDevtools(
	devtools: IDevtools,
	container: IFluidContainer,
	containerKey: ContainerKey,
): void {
	devtools.registerContainerDevtools({
		container,
		containerKey,
		dataVisualizers: undefined, // Use defaults
	});
}

/**
 * React hook for asynchronously creating / loading two Fluid Containers: a shared container whose ID is put in
 * the URL to enable collaboration, and a private container that is only exposed to the local user.
 */
function useContainerInfo(
	devtools: IDevtools,
	logger: DevtoolsLogger,
): {
	privateContainer: ContainerInfo | undefined;
	sharedContainer: ContainerInfo | undefined;
} {
	const [sharedContainerInfo, setSharedContainerInfo] = React.useState<
		ContainerInfo | undefined
	>();
	const [privateContainerInfo, setPrivateContainerInfo] = React.useState<
		ContainerInfo | undefined
	>();

	// Get the Fluid Data data on app startup and store in the state
	React.useEffect(() => {
		async function getSharedFluidData(): Promise<ContainerInfo> {
			const containerId = getContainerIdFromLocation(window.location);
			return containerId.length === 0
				? createFluidContainer(containerSchema, logger, populateRootMap)
				: loadExistingFluidContainer(containerId, containerSchema, logger);
		}

		getSharedFluidData().then((containerInfo) => {
			if (getContainerIdFromLocation(window.location) !== containerInfo.containerId) {
				window.location.hash = containerInfo.containerId;
			}

			setSharedContainerInfo(containerInfo);
			registerContainerWithDevtools(devtools, containerInfo.container, sharedContainerKey);
		}, console.error);

		async function getPrivateContainerData(): Promise<ContainerInfo> {
			// Always create a new container for the private view.
			// This isn't shared with other collaborators.

			return createFluidContainer(containerSchema, logger, populateRootMap);
		}

		getPrivateContainerData().then((containerInfo) => {
			setPrivateContainerInfo(containerInfo);
			registerContainerWithDevtools(devtools, containerInfo.container, privateContainerKey);
		}, console.error);

		return (): void => {
			devtools?.dispose();
		};
	}, [devtools, logger]);

	return { sharedContainer: sharedContainerInfo, privateContainer: privateContainerInfo };
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
	// Initialize the Fluid Debugger logger
	const logger = React.useMemo(() => new DevtoolsLogger(), []);

	// Initialize Devtools
	const devtools = React.useMemo(() => initializeDevtools({ logger }), [logger]);

	React.useEffect(() => {
		// Dispose of devtools resources on teardown to ensure message listeners are notified.
		// Note that this isn't strictly necessary, as the Devtools will dispose of themselves on
		// window unload, but it is here for example completeness.
		return (): void => devtools.dispose();
	}, [devtools]);

	// Load the collaborative SharedString object
	const { privateContainer, sharedContainer } = useContainerInfo(devtools, logger);

	const view = (
		<Stack horizontal>
			<StackItem>
				{sharedContainer === undefined ? (
					<Stack horizontalAlign="center" tokens={{ childrenGap: 10 }}>
						<Spinner />
						<div>Loading Shared container...</div>
					</Stack>
				) : (
					<AppView {...sharedContainer} containerKey={sharedContainerKey} />
				)}
			</StackItem>
			<StackItem>
				{privateContainer === undefined ? (
					<Stack horizontalAlign="center" tokens={{ childrenGap: 10 }}>
						<Spinner />
						<div>Loading Private container...</div>
					</Stack>
				) : (
					<AppView {...privateContainer} containerKey={privateContainerKey} />
				)}
			</StackItem>
		</Stack>
	);

	return <ThemeProvider theme={appTheme}>{view}</ThemeProvider>;
}

/**
 * {@link AppView} input props.
 */
interface AppViewProps extends ContainerInfo, HasContainerKey {}

/**
 * Inner app view.
 *
 * @remarks Valid to display once the container has been created / loaded.
 */
function AppView(props: AppViewProps): React.ReactElement {
	const { container, containerKey } = props;

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

	const emojiMatrixHandle = rootMap.get(emojiMatrixKey) as IFluidHandle<
		SharedMatrix<IFluidHandle<SharedCell<boolean>>>
	>;
	if (emojiMatrixHandle === undefined) {
		throw new Error(`"${emojiMatrixKey}" entry not found in rootMap.`);
	}

	return (
		<Stack horizontal className={rootStackStyles}>
			<StackItem className={appViewPaneStackStyles}>
				<h4>{containerKey}</h4>
				<Stack>
					<StackItem>
						<EmojiMatrixView emojiMatrixHandle={emojiMatrixHandle} />
					</StackItem>
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
			console.error("Error encountered loading SharedString:", error);
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
			console.error("Error encountered loading SharedCounter:", error);
			throw error;
		});
	}, [sharedCounterHandle, setSharedCounter]);

	return sharedCounter === undefined ? <Spinner /> : <CounterWidget counter={sharedCounter} />;
}

interface EmojiMatrixViewProps {
	emojiMatrixHandle: IFluidHandle<SharedMatrix>;
}

function EmojiMatrixView(props: EmojiMatrixViewProps): React.ReactElement {
	const { emojiMatrixHandle } = props;

	const [emojiMatrix, setEmojiMatrix] = React.useState<SharedMatrix | undefined>();

	React.useEffect(() => {
		emojiMatrixHandle.get().then(setEmojiMatrix, (error) => {
			console.error("Error encountered loading SharedMatrix:", error);
			throw error;
		});
	}, [emojiMatrixHandle, setEmojiMatrix]);

	return emojiMatrix === undefined ? <Spinner /> : <EmojiGrid emojiMatrix={emojiMatrix} />;
}
