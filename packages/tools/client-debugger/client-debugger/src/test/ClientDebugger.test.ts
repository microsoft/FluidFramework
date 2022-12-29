/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedCounter } from "@fluidframework/counter";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";

import { clearDebuggerRegistry, getDebuggerRegistry, getFluidClientDebugger } from "../Registry";
import {
	ContainerInfo,
	closeFluidClientDebugger,
	createFluidContainer,
	initializeFluidClientDebugger,
} from "./ClientUtilities";

/* eslint-disable @typescript-eslint/no-non-null-assertion */

describe("ClientDebugger unit tests", () => {
	let containerInfo: ContainerInfo | undefined;
	let containerId: string | undefined;
	let containerInfoOther: ContainerInfo | undefined;
	let containerIdOther: string | undefined;

	beforeEach(async () => {
		const client = new TinyliciousClient();

		// Create the container
		console.log("Creating new container...");

		try {
			containerInfo = await createFluidContainer(client, {
				initialObjects: {
					counter: SharedCounter,
				},
				dynamicObjectTypes: [SharedCounter],
			});

			containerInfoOther = await createFluidContainer(client, {
				initialObjects: {
					counter: SharedCounter,
				},
				dynamicObjectTypes: [SharedCounter],
			});
		} catch (error) {
			console.error(`Encountered error creating Fluid container: "${error}".`);
			throw error;
		}
		console.log("Container created!");

		const { container: tinyliciousContainer } = containerInfo;
		const { container: tinyliciousContainerOther } = containerInfoOther;

		// Attach container
		console.log("Awaiting container attach...");
		try {
			containerId = await tinyliciousContainer.attach();
			containerIdOther = await tinyliciousContainerOther.attach();
		} catch (error) {
			console.error(`Encountered error attaching Fluid container: "${error}".`);
			throw error;
		}
		console.log("Fluid container attached!");
	});

	afterEach(() => {
		clearDebuggerRegistry();
		closeFluidClientDebugger(containerInfo!.containerId);
		containerInfo!.container.dispose();
		containerInfo = undefined;
	});

	it("Initializing multi-debugger populates global (window) registry", () => {
		let debuggerRegistry = getDebuggerRegistry();
		expect(debuggerRegistry.size).toEqual(0); // There should be no registered debuggers yet.

		initializeFluidClientDebugger(containerInfo);
		initializeFluidClientDebugger(containerInfoOther);

		debuggerRegistry = getDebuggerRegistry();
		expect(debuggerRegistry.size).toEqual(2);
	});

	it("Validate multi-debugger contents are as expected", () => {
		const clientDebugger = getFluidClientDebugger(containerId);
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(clientDebugger?.disposed).toBe(false);

		const clientDebuggerOther = getFluidClientDebugger(containerIdOther);
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(clientDebuggerOther?.disposed).toBe(false);
	});

	it("Validate debugger audiences are not null", () => {
		const clientDebugger = getFluidClientDebugger(containerId);
		expect(clientDebugger.audience).not.toBeNull();

		const clientDebuggerOther = getFluidClientDebugger(containerIdOther);
		expect(clientDebuggerOther.audience).not.toBeNull();
	});

	it("Closing multi-debugger removes it from global (window) registry and disposes it.", () => {
		let debuggerRegistry = getDebuggerRegistry();
		const clientDebugger = getFluidClientDebugger(containerId);
		const clientDebuggerOther = getFluidClientDebugger(containerIdOther);

		expect(debuggerRegistry.size).toEqual(2);

		closeFluidClientDebugger(containerId);
		closeFluidClientDebugger(containerIdOther);

		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(clientDebugger?.disposed).toBe(true);
		expect(clientDebuggerOther?.disposed).toBe(true);

		debuggerRegistry = getDebuggerRegistry();
		expect(debuggerRegistry.size).toEqual(0);
	});
});

/* eslint-enable @typescript-eslint/no-non-null-assertion */
