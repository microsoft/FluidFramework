// Render debugger as child (at end) of target element
// V1: take target element directly

import React from "react";
import ReactDOM from "react-dom";
import { HasClientDebugger } from "./CommonProps";
import { closeFluidClientDebugger, ContainerInfo, createFluidContainer, initializeFluidClientDebugger, loadExistingFluidContainer } from "./test";
import { ClientDebugView } from "./components";
import TinyliciousClient, { ITinyliciousAudience } from "@fluidframework/tinylicious-client";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { SharedCounter } from "@fluidframework/counter";
import { SharedString } from "@fluidframework/sequence";
import { Spinner, Stack } from "@fluentui/react";
import { getFluidClientDebugger } from "@fluid-tools/client-debugger";


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

interface ContainerInfoWithDebugger extends ContainerInfo, HasClientDebugger {}

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
 * React hook for asynchronously creating / loading the Fluid Container.
 */
 function useContainerInfo(): ContainerInfoWithDebugger | undefined {
	const [containerInfo, setContainerInfo] = React.useState<ContainerInfoWithDebugger>();

	// Get the Fluid Data data on app startup and store in the state
	React.useEffect(() => {
		async function getFluidData(): Promise<ContainerInfo> {
			const client: TinyliciousClient = new TinyliciousClient();

			let container: IFluidContainer;
			let audience: ITinyliciousAudience;
			let containerId = getContainerIdFromLocation(window.location);
			if (containerId.length === 0) {
				({ container, audience, containerId } = await createFluidContainer(
					client,
					containerSchema,
					populateRootMap,
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

				const clientDebugger = initializeFluidClientDebugger(data);
				setContainerInfo({
					...data,
					clientDebugger,
				});
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

export async function renderClientDebugger(domId: string): Promise<void> {
    const containerInfo = useContainerInfo();
    const containerId = new String(containerInfo?.containerId).toString();
    const targetElement: HTMLElement | null = document.querySelector("#"+domId);

    /* eslint-enable @typescript-eslint/no-non-null-assertion */
    const view = containerInfo !== undefined ? (
        <ClientDebugView containerId={containerId} clientDebugger={getFluidClientDebugger(containerId)} />
        ) : (
        <Stack horizontalAlign="center" tokens={{ childrenGap: 10 }}>
            <Spinner />
            <div>Loading Fluid container...</div>
            </Stack>
            );

    return new Promise<void>((resolve, reject) => {
        ReactDOM.render(view,targetElement, resolve);
    });
}

// #1: Render "debugger panel" as a child under provided element
// #2: Render "debugger frame" - user passes in element, we wrap that element in a frame containing the debug view
//    + UI for showing / hiding the "debugger panel".
//   renderWithClientDebugger(appElement);
//   const parent = appElement.parent;
//   render app and frame
