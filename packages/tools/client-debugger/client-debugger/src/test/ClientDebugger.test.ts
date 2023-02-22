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
	getDebuggerRegistry,
	DebuggerRegistry,
} from "../Registry";

import { addAudienceMember, createMockContainer, removeAudienceMember } from "./Utilities";

/* eslint-disable @typescript-eslint/no-non-null-assertion */

describe("ClientDebugger unit tests", () => {
	const containerId = "test-container-id";
	let container: IContainer | undefined;

	const otherContainerId = "test-container-id-other";
	let otherContainer: IContainer | undefined;

	const registry: DebuggerRegistry = getDebuggerRegistry();

	let clientId: string | undefined;

	let debuggerRegistered = false;
	let debuggerClosed = false;
	let audienceAdded = false;
	let audienceRemoved = false;

	beforeEach(async () => {
		container = createMockContainer();
		otherContainer = createMockContainer();

		container.audience.on("addMember", () => {
			audienceAdded = true;
		});
		container.audience.on("removeMember", () => {
			audienceRemoved = true;
		});

		registry.on("debuggerRegistered", () => {
			debuggerRegistered = true;
		});
		registry.on("debuggerClosed", () => {
			debuggerClosed = true;
		});
	});

	afterEach(() => {
		debuggerRegistered = false;
		debuggerClosed = false;
		audienceAdded = false;
		audienceRemoved = false;
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

		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(debuggerRegistered).to.be.false;
		initializeDebugger(containerId, container!);
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(debuggerRegistered).to.be.true;
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

	it("Validate audience contents are as expected ", () => {
		const clientDebugger = initializeDebugger(containerId, container!);

		// verify audience change in container is reflecting in client debugger
		clientId = addAudienceMember(container!);
		expect(container?.audience.getMembers().size).to.equal(1);
		expect(clientDebugger?.getAudienceHistory().length).to.equal(1);
		expect(clientDebugger?.getAudienceHistory()[0].clientId).to.equal(clientId);
		expect(clientDebugger?.getAudienceHistory()[0].changeKind).to.equal("added");
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(audienceAdded).to.be.true;

		removeAudienceMember(container!, clientId);
		expect(container!.audience.getMembers().size).to.equal(0);
		expect(clientDebugger?.getAudienceHistory().length).to.equal(2);
		expect(clientDebugger?.getAudienceHistory()[1].clientId).to.equal(clientId);
		expect(clientDebugger?.getAudienceHistory()[1].changeKind).to.equal("removed");
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(audienceRemoved).to.be.true;
	});

	it("Closing debugger removes it from global (window) registry and disposes it.", () => {
		const clientDebugger = initializeDebugger(containerId, container!);
		const otherClientDebugger = initializeDebugger(otherContainerId, otherContainer!);

		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(clientDebugger.disposed).to.be.false;
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(otherClientDebugger.disposed).to.be.false;
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(debuggerClosed).to.be.false;

		let debuggers = getFluidClientDebuggers();
		expect(debuggers.length).to.equal(2);

		closeFluidClientDebugger(containerId);
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(clientDebugger.disposed).to.be.true;
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(debuggerClosed).to.be.true;

		closeFluidClientDebugger(otherContainerId);
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(otherClientDebugger.disposed).to.be.true;

		debuggers = getFluidClientDebuggers();
		expect(debuggers.length).to.equal(0);
	});
});

/* eslint-enable @typescript-eslint/no-non-null-assertion */
