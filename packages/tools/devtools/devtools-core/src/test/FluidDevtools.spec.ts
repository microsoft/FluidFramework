/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IRequest } from "@fluidframework/core-interfaces";
import type { FluidContainer } from "@fluidframework/driver-definitions/internal";
import { ServiceContainerBase } from "@fluidframework/runtime-utils/internal";
import { expect } from "chai";

import {
	ContainerDevtools,
	type ContainerDevtoolsProps,
	type FluidContainerDevtoolsProps,
} from "../ContainerDevtools.js";
import {
	FluidDevtools,
	accessBeforeInitializeErrorText,
	getContainerAlreadyRegisteredErrorText,
	initializeDevtools,
	initializeDevtoolsAlpha,
	useAfterDisposeErrorText,
} from "../FluidDevtools.js";

import { addAudienceMember, createMockContainer } from "./Utilities.js";

class TestServiceContainer extends ServiceContainerBase<unknown> {
	public constructor(container: IContainer) {
		super(
			async () => {
				throw new Error("Registry lookup is not used by these tests");
			},
			undefined,
			container,
			undefined,
			undefined,
		);
	}

	protected override createAttachRequest(): IRequest {
		return { url: "test-container" };
	}
}

// TODOs:
// - Test window messaging

describe("FluidDevtools unit tests", () => {
	afterEach(() => {
		FluidDevtools.tryGet()?.dispose();
	});

	it("Container change events", () => {
		const devtools = FluidDevtools.initialize();

		expect(devtools.getAllContainers().length).to.equal(0);

		const container = createMockContainer();
		const containerKey = "test-container-key";
		const containerProps: ContainerDevtoolsProps = {
			containerKey,
			container,
		};
		devtools.registerContainerDevtools(containerProps);

		expect(devtools.getAllContainers().length).to.equal(1);

		const containerDevtools = devtools.getContainerDevtools(containerKey);
		expect(containerDevtools).to.not.be.undefined;
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		expect(containerDevtools!.disposed).to.be.false;

		devtools.closeContainerDevtools(containerKey);

		expect(devtools.getAllContainers().length).to.equal(0);
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

	it("Registers an IContainer with an application-defined data property", () => {
		const devtools = initializeDevtools({});
		const container = Object.assign(createMockContainer(), { data: undefined });
		const containerKey = "container-with-data";
		devtools.registerContainerDevtools({ containerKey, container });
		const containerDevtools = FluidDevtools.getOrThrow().getContainerDevtools(containerKey);
		assert(containerDevtools instanceof ContainerDevtools);
		expect(containerDevtools.containerKey).to.equal(containerKey);
		container.connect();
		expect(
			containerDevtools.getContainerConnectionLog().map((entry) => entry.newState),
		).to.deep.equal(["connected"]);
	});

	it("Preserves registration props implemented with prototype getters", () => {
		const devtools = initializeDevtools({});
		const container = createMockContainer();
		const containerKey = "container-with-getter-props";
		const containerData = {};
		class GetterProps implements ContainerDevtoolsProps {
			public get container(): IContainer {
				return container;
			}

			public get containerKey(): string {
				return containerKey;
			}

			public get containerData(): NonNullable<ContainerDevtoolsProps["containerData"]> {
				return containerData;
			}
		}
		devtools.registerContainerDevtools(new GetterProps());
		const containerDevtools = FluidDevtools.getOrThrow().getContainerDevtools(containerKey);
		assert(containerDevtools instanceof ContainerDevtools);
		expect(containerDevtools.containerKey).to.equal(containerKey);
		expect(containerDevtools.containerData).to.equal(containerData);
	});

	it("Registers a service container and observes its state and audience", () => {
		const devtools = initializeDevtoolsAlpha({});
		const container = createMockContainer();
		const serviceContainer: FluidContainer = new TestServiceContainer(container);
		const props: FluidContainerDevtoolsProps = {
			containerKey: "service-container",
			container: serviceContainer,
			containerData: {},
		};
		devtools.registerContainerDevtools(props);
		const containerDevtools = FluidDevtools.getOrThrow().getContainerDevtools(
			props.containerKey,
		);
		assert(containerDevtools instanceof ContainerDevtools);
		expect(containerDevtools.containerData).to.equal(props.containerData);
		container.connect();
		const clientId = addAudienceMember(container);
		serviceContainer.close();
		expect(
			containerDevtools?.getContainerConnectionLog().map((entry) => entry.newState),
		).to.deep.equal(["connected", "closed"]);
		expect(containerDevtools?.getAudienceHistory()[0]?.clientId).to.equal(clientId);
		expect(() => devtools.registerContainerDevtools(props)).to.throw(
			getContainerAlreadyRegisteredErrorText(props.containerKey),
		);
		devtools.closeContainerDevtools(props.containerKey);
		expect(containerDevtools?.disposed).to.be.true;
		expect(FluidDevtools.getOrThrow().getAllContainers().length).to.equal(0);
		devtools.registerContainerDevtools(props);
		devtools.dispose();
		expect(() => devtools.registerContainerDevtools(props)).to.throw(useAfterDisposeErrorText);
	});

	it("Registers a service container without visualization data", () => {
		const devtools = initializeDevtoolsAlpha({});
		devtools.registerContainerDevtools({
			containerKey: "service-container",
			container: new TestServiceContainer(createMockContainer()),
		});
		expect(FluidDevtools.getOrThrow().getAllContainers().length).to.equal(1);
		const containerDevtools =
			FluidDevtools.getOrThrow().getContainerDevtools("service-container");
		assert(containerDevtools instanceof ContainerDevtools);
		expect(containerDevtools.containerData).to.be.undefined;
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
