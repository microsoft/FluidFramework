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
	getFluidClientDebuggers,
	getFluidClientDebugger,
	initializeFluidClientDebugger,
} from "../Registry";
import { createMockContainer } from "./Utilities";

/* eslint-disable @typescript-eslint/no-non-null-assertion */

describe("ClientDebugger unit tests", () => {
	const containerId = "test-container-id";
	let container: IContainer | undefined;

	const otherContainerId = "test-container-id-other";
	let otherContainer: IContainer | undefined;

	beforeEach(async () => {
		container = createMockContainer();
		otherContainer = createMockContainer();
	});

	afterEach(() => {
		clearDebuggerRegistry();
	});

	function initializeDebugger(
		_containerId: string,
		_container: IContainer,
	): IFluidClientDebugger {
		initializeFluidClientDebugger({ container: _container, containerId: _containerId });
		return getFluidClientDebugger(_containerId)!;
	}

	it("Initializing debugger populates global (window) registry", () => {
		let debuggers = getFluidClientDebuggers();
		expect(debuggers.length).to.equal(0); // There should be no registered debuggers yet.

		initializeDebugger(containerId, container!);
		initializeDebugger(otherContainerId, otherContainer!);

		debuggers = getFluidClientDebuggers();
		expect(debuggers.length).to.equal(2);
	});

	it("Validate multi-debugger contents are as expected", () => {
		const clientDebugger = getFluidClientDebugger(containerId);
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(clientDebugger?.disposed).to.be.false;

		const clientDebuggerOther = getFluidClientDebugger(otherContainerId);
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(clientDebuggerOther?.disposed).to.be.false;
	});

	it("Closing debugger removes it from global (window) registry and disposes it.", () => {
		const clientDebugger = initializeDebugger(containerId, container!);
		const otherClientDebugger = initializeDebugger(otherContainerId, otherContainer!);

		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(clientDebugger.disposed).to.be.false;
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(otherClientDebugger.disposed).to.be.false;

		let debuggers = getFluidClientDebuggers();
		expect(debuggers.length).to.equal(2);

		closeFluidClientDebugger(containerId);
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(clientDebugger.disposed).to.be.true;

		closeFluidClientDebugger(otherContainerId);
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(otherClientDebugger.disposed).to.be.true;

		debuggers = getFluidClientDebuggers();
		expect(debuggers.length).to.equal(0);
	});
});

/* eslint-enable @typescript-eslint/no-non-null-assertion */
