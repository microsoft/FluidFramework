/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeTextArea, SharedStringHelper } from "@fluid-example/example-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter/internal";
import {
	SharedCell,
	type ISharedCell,
	// type ISharedCell
} from "@fluidframework/cell/internal";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { type ISharedMap, SharedMap } from "@fluidframework/map/internal";
import { SharedString } from "@fluidframework/sequence/internal";
import React, { useState } from "react";

import {
	ContainerInfo,
	createFluidContainer,
	loadExistingFluidContainer,
} from "./ClientUtilities.js";
// import { useAppSerializer } from "./useAppSerializer.js";
// import { CounterTracker } from "./AppSerializerV2.js";
import {
	AppSerializer,
	// APPSDepTrackerV1,
	MultiDepTracker,
	type Dependency
}
	from "./ConditionalStringProducer.js";

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

	// Set up SharedText for text form
	const sharedCell = await container.create(SharedCell);
	rootMap.set(sharedCellKey, sharedCell.handle);


	// ------ Collab Form Setup --------
	const field1String = await container.create(SharedString);
	field1String.insertText(0, "");
	rootMap.set('field1String', field1String.handle);

	const field2String = await container.create(SharedString);
	field2String.insertText(0, "");
	rootMap.set('field2String', field2String.handle);

	const field3String = await container.create(SharedString);
	field3String.insertText(0, "");
	rootMap.set('field3String', sharedText.handle);

	const counter1 = await container.create(SharedCounter);
	rootMap.set("counterField1", counter1.handle);
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
	const { container } = containerInfo;

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

	return (

		<CollabForm
			containerInfo={containerInfo}
			field1FluidHandle={rootMap.get("field1String")!}
			field2FluidHandle={rootMap.get("field2String")!}
			field3FluidHandle={rootMap.get("field3String")!}
			counter1FluidHandle={rootMap.get("counterField1")!}
		/>
	);
}



interface CollabFormProps {
	containerInfo: ContainerInfo;
	field1FluidHandle: IFluidHandle<SharedString>;
	field2FluidHandle: IFluidHandle<SharedString>;
	field3FluidHandle: IFluidHandle<SharedString>;
	counter1FluidHandle: IFluidHandle<SharedCounter>;
}

function CollabForm(props: CollabFormProps) {

	const [field1Input, setField1Input] = React.useState<SharedString | undefined>();
	const [field2Input, setField2Input] = React.useState<SharedString | undefined>();
	const [field3Input, setField3Input] = React.useState<SharedString | undefined>();
	const [counter1, setCounter1] = React.useState<SharedCounter | undefined>();

	React.useEffect(() => {
		const getAndSetFluidDDS = async (handle: IFluidHandle<unknown>, setterFn: (SharedString) => void) => {
			handle.get().then(
				(value) => {
					console.log("handle value updated", value);
					setterFn(value);
				},
				(error) => {
					console.error(`Error encountered loading dds from handle: "${error}".`);
					throw error;
				},
			);
		}

		getAndSetFluidDDS(props.field1FluidHandle, setField1Input);
		getAndSetFluidDDS(props.field2FluidHandle, setField2Input);
		getAndSetFluidDDS(props.field3FluidHandle, setField3Input);
		getAndSetFluidDDS(props.counter1FluidHandle, setCounter1);

	}, [props.field1FluidHandle, props.field2FluidHandle, props.field3FluidHandle, props.counter1FluidHandle]);

	const [appSerializer, setAppSerializer] = useState<AppSerializer>();

	React.useEffect(() => {

		const segments: MultiDepTracker<string>[] = [];
		// Author field
		if (field1Input !== undefined) {
			const field1Dependency: Dependency<string> = {
				getValue: () => field1Input.getText(),
				qualifier: (prev, next) => prev !== next,
			};

			const multiDep1 = new MultiDepTracker([field1Dependency], () => {
				const val = `# Application Security Report\n\n- Author: ${field1Input?.getText()} \n\n`;
				// console.log(val);
				return val;
			});

			new SharedStringHelper(field1Input).on('textChanged', () => {
				multiDep1.trigger(); //TODO: Debounce this
			});

			segments.push(multiDep1);
		}


		if (field2Input !== undefined && field3Input !== undefined) {
			const field2Dependency: Dependency<string> = {
				getValue: () => field2Input.getText(),
				qualifier: (prev, next) => prev !== next,
			};

			const field3Dependency: Dependency<string> = {
				getValue: () => field3Input.getText(),
				qualifier: (prev, next) => prev !== next,
			};

			const multiDep2 = new MultiDepTracker([field2Dependency, field3Dependency], () => {
				const val = `## The description of the application\n\n "${field2Input?.getText()}" \n\n`;
				const val2 = `## The way the applications front end communicates with back end services\n\n ${field3Input?.getText()} \n\n`
				// console.log(val + val2);
				return val + val2;
			});

			// Triggers
			new SharedStringHelper(field2Input).on('textChanged', () => {
				multiDep2.trigger(); //TODO: Debounce this
			});

			new SharedStringHelper(field3Input).on('textChanged', () => {
				multiDep2.trigger(); //TODO: Debounce this
			});

			segments.push(multiDep2);
		}

		if (counter1 !== undefined) {
			const counter1Dependency: Dependency<number> = {
				getValue: () => counter1.value,
				qualifier: (prev, next) => prev !== next,
			};

			const multiDep3 = new MultiDepTracker([counter1Dependency], () => {
				const val = `## The number of customer facing API endpoints: ${counter1?.value}`;
				// console.log(val);
				return val;
			});

			// Triggers
			counter1.on('incremented', () => {
				multiDep3.trigger();
			});

			segments.push(multiDep3);
		}


		if (segments.length === 3 && appSerializer === undefined) {
			const initializeAppSerializer = async () => {
				const rootMap = props.containerInfo.container.initialObjects.rootMap as ISharedMap;
				const sharedCellHandle = rootMap.get(sharedCellKey) as IFluidHandle<ISharedCell>;
				const sharedCell = await sharedCellHandle.get();
				setAppSerializer(new AppSerializer(segments, 5000, sharedCell));

			}
			initializeAppSerializer();
		}

	}, [field1Input, field2Input, field3Input, counter1]);

	return <div style={{ display: 'flex', width: '100%', border: '0px solid blue', flexDirection: 'column', alignItems: 'center', fontFamily: 'sans-serif' }}>
		<div style={{ display: 'flex', width: '400px', padding: '50px', border: '2px solid blue', alignItems: 'center', flexDirection: 'column', gap: '25px' }}>
			{field1Input !== undefined &&
				<div>
					<h1 style={{ fontSize: '15px' }}>Author</h1>
					<CollaborativeTextArea sharedStringHelper={new SharedStringHelper(field1Input)}
						style={{ height: '30px' }}
					/>
				</div>
			}
			{field2Input !== undefined &&
				<div>
					<h1 style={{ fontSize: '15px' }}>Describe your application architecture</h1>
					<CollaborativeTextArea sharedStringHelper={new SharedStringHelper(field2Input)}
						style={{ height: '100px' }}
					/>
				</div>
			}
			{field3Input !== undefined &&
				<div>
					<h1 style={{ fontSize: '15px' }}>Does your front-end communicate with backend services directly or through an api?</h1>
					<CollaborativeTextArea sharedStringHelper={new SharedStringHelper(field3Input)}
						style={{ height: '100px' }}
					/>
				</div>
			}
			{counter1 !== undefined &&
				<div>
					<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
						<h1 style={{ fontSize: '15px', maxWidth: '300px' }}>How many customer facing API endpoints does your application have? </h1>
						<CounterWidget counter={counter1} />
					</div>
				</div>
			}
		</div>
	</div>
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
			style={{ display: "flex", flexDirection: "row", gap: "5px" }}
		>
			<button
				onClick={(): void => counter.increment(-1)}
				disabled={counterValue === 0}
				aria-describedby={"decrement-counter-button"}
				style={{ width: '20px', height: '20px' }}
			>
				-
			</button>

			<div>{counterValue}</div>

			<button
				onClick={(): void => counter.increment(1)}
				aria-describedby={"increment-counter-button"}
				style={{ width: '20px', height: '20px' }}
			>
				+
			</button>
		</div>
	);
}
