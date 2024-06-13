/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeTextArea, SharedStringHelper } from "@fluid-example/example-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter/internal";
import { SharedCell, type ISharedCell } from "@fluidframework/cell/internal";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { type ISharedMap, SharedMap } from "@fluidframework/map/internal";
import { SharedString } from "@fluidframework/sequence/internal";
import React from "react";

import {
	ContainerInfo,
	createFluidContainer,
	loadExistingFluidContainer,
} from "./ClientUtilities.js";
import { useAppSerializer } from "./useAppSerializer.js";

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
const sharedCellKey = "shared-cell";

/**
 * Schema used by the app.
 */
const containerSchema: ContainerSchema = {
	initialObjects: {
		rootMap: SharedMap,
	},
	dynamicObjectTypes: [SharedCounter, SharedMap, SharedString, SharedCell],
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
	const rootMap = container.initialObjects.rootMap as ISharedMap;
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
	// rootMap.set("numeric-value", 42);
	// rootMap.set("string-value", "Hello world!");
	// rootMap.set("record-value", {
	// 	aNumber: 37,
	// 	aString: "Here is some text content.",
	// 	anObject: {
	// 		a: "a",
	// 		b: "b",
	// 	},
	// });

	// Set up SharedText for text form
	const sharedCell = await container.create(SharedCell);
	rootMap.set(sharedCellKey, sharedCell.handle);
}

/**
 * Root application component.
 * Initializes the Fluid Container and displays app view once it is ready.
 * @internal
 */
export function App(): React.ReactElement {
	const [containerInfo, setContainerInfo] = React.useState<ContainerInfo | undefined>();

	const getSharedFluidData = async (): Promise<ContainerInfo> => {
		const containerId = getContainerIdFromLocation(window.location);
		return containerId.length === 0
			? createFluidContainer(containerSchema, populateRootMap)
			: loadExistingFluidContainer(containerId, containerSchema);
	};

	// Get the Fluid Data data on app startup and store in the state
	React.useEffect(() => {
		getSharedFluidData().then(
			(data) => {
				if (getContainerIdFromLocation(window.location) !== data.containerId) {
					window.location.hash = data.containerId;
				}
				setContainerInfo(data);
			},
			(error) => {
				throw error;
			},
		);
	}, []);

	return (
		<>
			{containerInfo === undefined ? (
				<div style={{ padding: "10px" }}>
					<h1>Loading Shared container...</h1>
				</div>
			) : (
				<AppView containerInfo={containerInfo} />
			)}
		</>
	);
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
	const { container, containerId } = containerInfo;

	const rootMap = container.initialObjects.rootMap as ISharedMap;
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

	const sharedCellHandle = rootMap.get(sharedCellKey) as IFluidHandle<ISharedCell>;

	const serializeApp = async (): Promise<string> => {
		// console.log(sharedTextHandle)
		// console.log(sharedCounterHandle)
		// console.log(sharedCellHandle)

		const sharedText = await sharedTextHandle.get();
		const sharedCounter = await sharedCounterHandle.get();
		// const sharedCell = await sharedCellHandle.get();

		const appRepresentationMarkdown =
			`# Employee Signals \n` +
			`- Number of Happy Employees: ${sharedCounter.value} \n\n` +
			`- How employees are feeling: "${sharedText.getText()}"`;

		return appRepresentationMarkdown;
	};

	useAppSerializer({ serializer: serializeApp, frequencyMs: 5000, sharedCellHandle });

	return (
		<div style={{ padding: "10px" }}>
			<div style={{ padding: "10px" }}>
				<h4>{`Container Id: ${containerId}`}</h4>
			</div>

			<div style={{ padding: "10px", display: "flex", flexDirection: "row" }}>
				<h4>Number of happy employees</h4>
				<CounterView sharedCounterHandle={sharedCounterHandle} />
			</div>
			<div style={{ padding: "10px" }}>
				<TextView sharedTextHandle={sharedTextHandle} />
			</div>
		</div>
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
		<h4> Loading...</h4>
	) : (
		<div>
			<h2>How Employees are feeling: </h2>
			<div data-testid="collaborative-text-area-widget">
				<CollaborativeTextArea sharedStringHelper={new SharedStringHelper(sharedText)} />
			</div>
		</div>
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

	return sharedCounter === undefined ? (
		<h4> Loading...</h4>
	) : (
		<CounterWidget counter={sharedCounter} />
	);
}

/**
 * {@link CounterWidget} input props.
 */
export interface CounterWidgetProps {
	counter: SharedCounter;
}

/**
 * Simple counter widget.
 * Backed by a {@link @fluidframework/counter#SharedCounter}.
 * Affords simple incrementing and decrementing via buttons.
 */
export function CounterWidget(props: CounterWidgetProps): React.ReactElement {
	const { counter } = props;

	const [counterValue, setCounterValue] = React.useState<number>(counter.value);

	React.useEffect(() => {
		counter.on("incremented", () => {
			setCounterValue(counter.value);
		});
	}, [counter]);

	return (
		<div
			data-testid="shared-counter-widget"
			style={{ display: "flex", flexDirection: "row", gap: "10px" }}
		>
			<button
				onClick={(): void => counter.increment(-1)}
				disabled={counterValue === 0}
				aria-describedby={"decrement-counter-button"}
			>
				Decrement
			</button>

			<div>{counterValue}</div>

			<button
				onClick={(): void => counter.increment(1)}
				aria-describedby={"increment-counter-button"}
			>
				Increment
			</button>
		</div>
	);
}
