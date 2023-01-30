/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { IContainer } from "@fluidframework/container-definitions";

import { IFluidClientDebugger } from "../IFluidClientDebugger";
import {
	clearDebuggerRegistry,
	closeFluidClientDebugger,
	getDebuggerRegistry,
	getFluidClientDebugger,
	initializeFluidClientDebugger,
} from "../Registry";
import { createMockContainer } from "./Utilities";

/* eslint-disable @typescript-eslint/no-non-null-assertion */

describe("ClientDebugger unit tests", () => {
	const containerId = "test-container-id";
	let container: IContainer | undefined;

	beforeEach(async () => {
		container = createMockContainer();
	});

	afterEach(() => {
		clearDebuggerRegistry();
	});

	function initializeDebugger(): IFluidClientDebugger {
		initializeFluidClientDebugger({ container: container!, containerId });
		return getFluidClientDebugger(containerId)!;
	}

	it("Initializing debugger populates global (window) registry", () => {
		let debuggerRegistry = getDebuggerRegistry();
		expect(debuggerRegistry.size).to.equal(0); // There should be no registered debuggers yet.

		initializeDebugger();

		debuggerRegistry = getDebuggerRegistry();
		expect(debuggerRegistry.size).to.equal(1);
	});

	it("Closing debugger removes it from global (window) registry and disposes it.", () => {
		const clientDebugger = initializeDebugger();

		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(clientDebugger.disposed).to.be.false;

		let debuggerRegistry = getDebuggerRegistry();
		expect(debuggerRegistry.size).to.equal(1);

		closeFluidClientDebugger(containerId);

		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(clientDebugger.disposed).to.be.true;

		debuggerRegistry = getDebuggerRegistry();
		expect(debuggerRegistry.size).to.equal(0);
	});
});

/* eslint-enable @typescript-eslint/no-non-null-assertion */
