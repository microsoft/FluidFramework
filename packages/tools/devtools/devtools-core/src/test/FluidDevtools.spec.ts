/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedCounter } from "@fluidframework/counter/internal";
import { SharedString } from "@fluidframework/sequence/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import { expect } from "chai";

import type { ContainerDevtoolsProps } from "../ContainerDevtools.js";
import {
	FluidDevtools,
	accessBeforeInitializeErrorText,
	getContainerAlreadyRegisteredErrorText,
	initializeDevtools,
	useAfterDisposeErrorText,
} from "../FluidDevtools.js";

import { createMockContainer } from "./Utilities.js";

// TODOs:
// - Test window messaging

describe("FluidDevtools unit tests", () => {
	afterEach(() => {
		FluidDevtools.tryGet()?.dispose();
	});

	it("Container change events", () => {
		const devtools = FluidDevtools.initialize();

		expect(devtools.getAllContainerDevtools().length).to.equal(0);

		const container = createMockContainer();
		const containerKey = "test-container-key";
		const containerProps: ContainerDevtoolsProps = {
			containerKey,
			container,
		};
		devtools.registerContainerDevtools(containerProps);

		expect(devtools.getAllContainerDevtools().length).to.equal(1);

		const containerDevtools = devtools.getContainerDevtools(containerKey);
		expect(containerDevtools).to.not.be.undefined;
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		expect(containerDevtools!.disposed).to.be.false;

		devtools.closeContainerDevtools(containerKey);

		expect(devtools.getAllContainerDevtools().length).to.equal(0);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		expect(containerDevtools!.disposed).to.be.true;

		devtools.dispose();
	});

	it("Disposal", () => {
		const devtools = FluidDevtools.initialize();

		devtools.dispose();

		expect(devtools.disposed).to.be.true;

		const container = createMockContainer();
		const containerKey = "test-container-key";
		const containerProps: ContainerDevtoolsProps = {
			containerKey,
			container,
		};

		// Validate that subsequent actions on disposed devtools instance fail
		expect(() => devtools.registerContainerDevtools(containerProps)).to.throw(
			useAfterDisposeErrorText,
		);
		expect(() => devtools.closeContainerDevtools(containerKey)).to.throw(
			useAfterDisposeErrorText,
		);
	});

	it("Registering a duplicate Container key throws", () => {
		const devtools = FluidDevtools.initialize();

		const containerKey = "test-container-key";

		const container1 = createMockContainer();
		const container1Props: ContainerDevtoolsProps = {
			containerKey,
			container: container1,
		};
		devtools.registerContainerDevtools(container1Props);

		const container2 = createMockContainer();
		const container2Props: ContainerDevtoolsProps = {
			containerKey,
			container: container2,
		};

		expect(() => devtools.registerContainerDevtools(container2Props)).to.throw(
			getContainerAlreadyRegisteredErrorText(containerKey),
		);
	});

	it("Registering a new container data to an existing devtools and disposing the devtools", () => {
		const devtools = FluidDevtools.initialize();

		const containerKey = "test-container-key";

		const container = createMockContainer();
		const containerProps: ContainerDevtoolsProps = {
			containerKey,
			container,
		};
		devtools.registerContainerDevtools(containerProps);

		const containerDataBefore = devtools.getContainerDevtools(containerKey)?.containerData;
		expect(containerDataBefore).to.be.undefined;

		const runtime = new MockFluidDataStoreRuntime({
			registry: [SharedCounter.getFactory(), SharedString.getFactory()],
		});
		const sharedCounter = SharedCounter.create(runtime, "test-counter");
		sharedCounter.increment(37);

		const sharedCounterKey = "shared-counter";
		const newSharedCounterData = { [sharedCounterKey]: sharedCounter };
		devtools.addContainerData(containerKey, newSharedCounterData);

		const containerDataAfter1 = devtools.getContainerDevtools(containerKey)?.containerData;
		expect(Object.keys(containerDataAfter1 ?? {}).length).to.equal(1);
		expect(containerDataAfter1?.[sharedCounterKey]).to.equal(sharedCounter);

		const sharedString = SharedString.create(runtime, "test-string-1");
		sharedString.insertText(0, "Hello World!");

		const sharedStringKey = "shared-string";
		const newSharedStringData = { [sharedStringKey]: sharedString };
		devtools.addContainerData(containerKey, newSharedStringData);

		const containerDataAfter2 = devtools.getContainerDevtools(containerKey)?.containerData;
		expect(Object.keys(containerDataAfter2 ?? {}).length).to.equal(2);
		expect(containerDataAfter2?.[sharedStringKey]).to.equal(sharedString);

		devtools.dispose();

		const sharedString2 = SharedString.create(runtime, "test-string-2");
		sharedString2.insertText(0, "Hello World!");

		const sharedStringKey2 = "shared-string-2";
		const newSharedStringData2 = { [sharedStringKey2]: sharedString2 };
		expect(() => devtools.addContainerData(containerKey, newSharedStringData2)).to.throw(
			useAfterDisposeErrorText,
		);
	});

	it("tryGet", () => {
		expect(FluidDevtools.tryGet()).to.be.undefined;

		const devtools = initializeDevtools({});

		expect(FluidDevtools.tryGet()).to.not.be.undefined;

		devtools.dispose();

		expect(FluidDevtools.tryGet()).to.be.undefined;
	});

	it("getOrThrow", () => {
		expect(() => FluidDevtools.getOrThrow()).to.throw(accessBeforeInitializeErrorText);

		const devtools = initializeDevtools({});

		expect(() => FluidDevtools.getOrThrow()).to.not.throw();

		devtools.dispose();

		expect(() => FluidDevtools.getOrThrow()).to.throw(accessBeforeInitializeErrorText);
	});
});
