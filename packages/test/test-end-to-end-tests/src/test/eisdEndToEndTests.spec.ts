/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// eslint-disable-next-line import/no-extraneous-dependencies
import {
	type EmptyIndependentDirectory,
	Latest,
	EphemeralIndependentDirectory,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluid-experimental/ephemeral-independent/alpha";
import { IContainer, IProvideRuntimeFactory } from "@fluidframework/container-definitions";

import {
	ITestObjectProvider,
	createTestContainerRuntimeFactory,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils";
import { describeCompat } from "@fluid-private/test-version-utils";

describeCompat("EphemeralIndependentDirectory", "NoCompat", (getTestObjectProvider, apis) => {
	const TestContainerRuntimeFactory = createTestContainerRuntimeFactory(
		apis.containerRuntime.ContainerRuntime,
	);

	const runtimeFactory: IProvideRuntimeFactory = {
		IRuntimeFactory: new TestContainerRuntimeFactory(
			EphemeralIndependentDirectory.factory.type,
			EphemeralIndependentDirectory.factory,
			{},
		),
	};

	let provider: ITestObjectProvider;

	const createContainer = async (): Promise<IContainer> =>
		provider.createContainer(runtimeFactory);

	const loadContainer = async (): Promise<IContainer> => provider.loadContainer(runtimeFactory);

	const getEISD = async (container: IContainer): Promise<EphemeralIndependentDirectory> => {
		const eisd =
			await getContainerEntryPointBackCompat<EphemeralIndependentDirectory>(container);
		return eisd;
	};

	beforeEach(async () => {
		provider = getTestObjectProvider();
	});

	describe("Single client essentials", () => {
		let eisd: EphemeralIndependentDirectory;

		beforeEach(async () => {
			const container = await createContainer();
			eisd = await getEISD(container);
		});

		it("can create an EISD", async () => {
			assert.ok(eisd);
		});

		it("can create a directory", async () => {
			assert.ok(eisd.directory);
		});
	});

	describe("Multi-client", () => {
		let container1: IContainer;
		let container2: IContainer;
		let eisd1: EphemeralIndependentDirectory;
		let eisd2: EphemeralIndependentDirectory;
		let directory1: EmptyIndependentDirectory;
		let directory2: EmptyIndependentDirectory;

		beforeEach(async () => {
			container1 = await createContainer();
			eisd1 = await getEISD(container1);
			directory1 = eisd1.directory;
			container2 = await loadContainer();
			eisd2 = await getEISD(container2);
			directory2 = eisd2.directory;

			await provider.ensureSynchronized();
		});

		it("can create two EISDs", async () => {
			assert.ok(eisd1);
			assert.ok(eisd2);
		});

		it("can create two directories", async () => {
			assert.ok(directory1);
			assert.ok(directory2);
		});

		it("can add local path + value", async () => {
			directory1.add("cursor", Latest({ x: 0, y: 0 }));
			assert.deepEqual(directory1.cursor.local, { x: 0, y: 0 });
		});

		it("can set local change", async () => {
			directory1.add("cursor", Latest({ x: 0, y: 0 }));
			directory1.cursor.local = { x: 3, y: 3 };
			assert.deepEqual(directory1.cursor.local, { x: 3, y: 3 });
		});

		it("can get remote change", async () => {
			directory1.add("cursor", Latest({ x: 0, y: 0 }));
			directory2.add("cursor", Latest({ x: 0, y: 0 }));
			directory1.cursor.local = { x: 3, y: 3 };

			await provider.ensureSynchronized();

			assert.ok(container1.clientId);
			console.log(container1.clientId);
			assert.deepEqual(directory2.cursor.clientValue(container1.clientId).value, {
				x: 3,
				y: 3,
			});
		});
	});
});
