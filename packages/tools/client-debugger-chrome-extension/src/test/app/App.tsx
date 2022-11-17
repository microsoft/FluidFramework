/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Spinner, Stack } from "@fluentui/react";
import React from "react";

import { SharedCounter } from "@fluidframework/counter";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { ITinyliciousAudience, TinyliciousClient } from "@fluidframework/tinylicious-client";

import { closeFluidClientDebugger } from "@fluid-tools/client-debugger";

import {
	ContainerInfo,
	createFluidContainer,
	initializeFluidClientDebugger,
	loadExistingFluidContainer,
} from "../ClientUtilities";
import { CounterWidget } from "./CounterWidget";

/**
 * Schema used by the app.
 */
const containerSchema: ContainerSchema = {
	initialObjects: {
		counter: SharedCounter,
	},
	dynamicObjectTypes: [SharedCounter],
};

/**
 * Helper function to read the container ID from the URL location.
 */
function getContainerIdFromLocation(location: Location): string {
	return location.hash.slice(1);
}

/**
 * React hook for asynchronously creating / loading the Fluid Container.
 */
function useContainerInfo(): ContainerInfo | undefined {
	const [containerInfo, setContainerInfo] = React.useState<ContainerInfo>();

	// Get the Fluid Data data on app startup and store in the state
	React.useEffect(() => {
		// eslint-disable-next-line unicorn/consistent-function-scoping
		async function getFluidData(): Promise<ContainerInfo> {
			const client: TinyliciousClient = new TinyliciousClient();

			let container: IFluidContainer;
			let audience: ITinyliciousAudience;
			let containerId = getContainerIdFromLocation(window.location);
			if (containerId.length === 0) {
				({ container, audience, containerId } = await createFluidContainer(
					client,
					containerSchema,
				));
			} else {
				({ container, audience } = await loadExistingFluidContainer(
					client,
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
				setContainerInfo(data);
			},
			(error) => {
				throw error;
			},
		);

		return (): void => {
			if (containerInfo !== undefined) {
				containerInfo.container.dispose();
				closeFluidClientDebugger(containerInfo.containerId);
			}
		};
	}, []);

	return containerInfo;
}

export function App(): React.ReactElement {
	// Load the collaborative SharedString object
	const containerInfo = useContainerInfo();

	return containerInfo !== undefined ? (
		<AppView containerInfo={containerInfo} />
	) : (
		<Stack horizontalAlign="center" tokens={{ childrenGap: 10 }}>
			<Spinner />
			<div>Loading Fluid container...</div>
		</Stack>
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

	const counter = container.initialObjects.counter as SharedCounter;
	if (counter === undefined) {
		throw new Error('"counter" not found in initialObjects tree.');
	}

	return <CounterWidget counter={counter} />;
}
