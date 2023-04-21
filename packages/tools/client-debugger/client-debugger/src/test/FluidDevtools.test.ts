/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import {
	FluidDevtools,
	getContainerAlreadyRegisteredErrorText,
	useAfterDisposeErrorText,
} from "../FluidDevtools";
import { ContainerDevtoolsProps } from "../ContainerDevtools";
import { createMockContainer } from "./Utilities";

// TODOs:
// - Test window messaging

describe("FluidDevtools unit tests", () => {
	it("Container change events", () => {
		const devtools = new FluidDevtools();

		let containerRegistered = false;
		let containerDevtoolsClosed = false;

		devtools.on("containerDevtoolsRegistered", () => {
			containerRegistered = true;
		});
		devtools.on("containerDevtoolsClosed", () => {
			containerDevtoolsClosed = true;
		});

		expect(devtools.getAllContainerDevtools().length).to.equal(0);

		const container = createMockContainer();
		const containerId = "test-container-id";
		const containerProps: ContainerDevtoolsProps = {
			containerId,
			container,
		};
		devtools.registerContainerDevtools(containerProps);

		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(containerRegistered).to.be.true;
		expect(devtools.getAllContainerDevtools().length).to.equal(1);

		const containerDevtools = devtools.getContainerDevtools(containerId);
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(containerDevtools).to.not.be.undefined;
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions, @typescript-eslint/no-non-null-assertion
		expect(containerDevtools!.disposed).to.be.false;

		devtools.closeContainerDevtools(containerId);

		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(containerDevtoolsClosed).to.be.true;
		expect(devtools.getAllContainerDevtools().length).to.equal(0);
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions, @typescript-eslint/no-non-null-assertion
		expect(containerDevtools!.disposed).to.be.true;

		devtools.dispose();
	});

	it("Disposal", () => {
		const devtools = new FluidDevtools();

		let devtoolsClosed = false;

		devtools.on("devtoolsDisposed", () => {
			devtoolsClosed = true;
		});

		devtools.dispose();

		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(devtoolsClosed).to.be.true;
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(devtools.disposed).to.be.true;

		const container = createMockContainer();
		const containerId = "test-container-id";
		const containerProps: ContainerDevtoolsProps = {
			containerId,
			container,
		};

		// Validate that subsequent actions on disposed devtools instance fail
		expect(() => devtools.registerContainerDevtools(containerProps)).to.throw(
			useAfterDisposeErrorText,
		);
		expect(() => devtools.closeContainerDevtools(containerId)).to.throw(
			useAfterDisposeErrorText,
		);
	});

	it("Registering a duplicate Container ID throws", () => {
		const devtools = new FluidDevtools();

		const containerId = "test-container-id";

		const container1 = createMockContainer();
		const container1Props: ContainerDevtoolsProps = {
			containerId,
			container: container1,
		};
		devtools.registerContainerDevtools(container1Props);

		const container2 = createMockContainer();
		const container2Props: ContainerDevtoolsProps = {
			containerId,
			container: container2,
		};

		expect(() => devtools.registerContainerDevtools(container2Props)).to.throw(
			getContainerAlreadyRegisteredErrorText(containerId),
		);
	});
});
