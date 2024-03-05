/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import { strict as assert } from "node:assert";
import { AttachState, ContainerErrorTypes } from "@fluidframework/container-definitions";
import { ContainerMessageType } from "@fluidframework/container-runtime";
import { type IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { type ContainerSchema, type IFluidContainer } from "@fluidframework/fluid-static";
import { SharedMap, SharedDirectory } from "@fluidframework/map";
import { timeoutPromise } from "@fluidframework/test-utils";
import { type ConnectionMode, ScopeType } from "@fluidframework/protocol-definitions";
import { InsecureTinyliciousTokenProvider } from "@fluidframework/tinylicious-driver";
import { TinyliciousClient } from "../index";
import { TestDataObject } from "./TestDataObject";

const corruptedAliasOp = async (
	runtime: IContainerRuntime,
	alias: string,
): Promise<boolean | Error> =>
	new Promise<boolean>((resolve, reject) => {
		runtime.once("dispose", () => reject(new Error("Runtime disposed")));
		(runtime as any).submit(ContainerMessageType.Alias, { id: alias }, resolve);
	}).catch((error) => new Error(error.message));

const runtimeOf = (dataObject: TestDataObject): IContainerRuntime =>
	(dataObject as any).context.containerRuntime as IContainerRuntime;

const connectionModeOf = (container: IFluidContainer): ConnectionMode =>
	(container as any).container.connectionMode as ConnectionMode;

const allDataCorruption = async (containers: IFluidContainer[]): Promise<boolean> =>
	Promise.all(
		containers.map(
			async (c) =>
				new Promise<boolean>((resolve) =>
					c.once("disposed", (error) => {
						resolve(error?.errorType === ContainerErrorTypes.dataCorruptionError);
					}),
				),
		),
	).then((all) => !all.includes(false));

describe("TinyliciousClient", () => {
	let tinyliciousClient: TinyliciousClient;
	const schema = {
		initialObjects: {
			map1: SharedMap,
		},
	} satisfies ContainerSchema;
	beforeEach(() => {
		tinyliciousClient = new TinyliciousClient();
	});

	/**
	 * Scenario: test if TinyliciousClient can be instantiated without a port
	 * number specified.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("can create instance without specifying port number", async () => {
		const containerAndServicesP = tinyliciousClient.createContainer(schema);

		await assert.doesNotReject(
			containerAndServicesP,
			() => true,
			"container cannot be created without specifying port number",
		);
	});

	/**
	 * Scenario: test if TinyliciousClient can be instantiated with a port number specified.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("can create a container successfully with port number specification", async () => {
		const clientProps = { connection: { port: 7070 } };
		const clientWithPort = new TinyliciousClient(clientProps);

		const containerAndServicesP = clientWithPort.createContainer(schema);

		await assert.doesNotReject(
			containerAndServicesP,
			() => true,
			"container cannot be created with port number",
		);
	});

	/**
	 * Scenario: test if TinyliciousClient can get a non-existing container.
	 *
	 * Expected behavior: an error should be thrown when trying to get a non-existent container.
	 */
	it("cannot load improperly created container (cannot load a non-existent container)", async () => {
		const containerAndServicesP = tinyliciousClient.getContainer("containerConfig", schema);

		const errorFn = (error): boolean => {
			assert.notStrictEqual(error.message, undefined, "TinyliciousClient error is undefined");
			return true;
		};

		await assert.rejects(
			containerAndServicesP,
			errorFn,
			"TinyliciousClient can load a non-existent container",
		);
	});

	/**
	 * Scenario: test when TinyliciousClient is instantiated correctly, it can create
	 * a container successfully.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("can create a container and services successfully", async () => {
		const containerAndServicesP = tinyliciousClient.createContainer(schema);

		await assert.doesNotReject(
			containerAndServicesP,
			() => true,
			"TinyliciousClient cannot create container and services successfully",
		);
	});

	it("creates a container with detached state", async () => {
		const { container } = await tinyliciousClient.createContainer(schema);
		assert.strictEqual(
			container.attachState,
			AttachState.Detached,
			"Container should be detached after creation",
		);
	});

	it("creates a container that can only be attached once", async () => {
		const { container } = await tinyliciousClient.createContainer(schema);
		const containerId = await container.attach();

		assert.strictEqual(typeof containerId, "string", "Attach did not return a string ID");
		assert.strictEqual(
			container.attachState,
			AttachState.Attached,
			"Container is not attached after attach is called",
		);

		await assert.rejects(container.attach(), () => true, "Container should not attached twice");
	});

	/**
	 * Scenario: Given the container already exists, test that TinyliciousClient can get the existing container
	 * when provided with valid ContainerConfig and ContainerSchema.
	 *
	 * Expected behavior: containerCreate should have the identical SharedMap ID as containerGet.
	 */
	it("can get a container successfully", async () => {
		const { container: containerCreate } = await tinyliciousClient.createContainer(schema);
		const containerId = await containerCreate.attach();
		await new Promise<void>((resolve, reject) => {
			containerCreate.on("connected", () => {
				resolve();
			});
		});

		const { container: containerGet } = await tinyliciousClient.getContainer(
			containerId,
			schema,
		);
		const map1Create = containerCreate.initialObjects.map1;
		const map1Get = containerGet.initialObjects.map1;
		assert.strictEqual(map1Get.id, map1Create.id, "Error getting a container");
	});

	/**
	 * Scenario: test if initialObjects passed into the container functions correctly.
	 *
	 * Expected behavior: initialObjects value loaded in two different containers should mirror
	 * each other after value is changed.
	 */
	it("can change initialObjects value", async () => {
		const { container: containerCreate } = await tinyliciousClient.createContainer(schema);
		const containerId = await containerCreate.attach();
		await timeoutPromise((resolve, reject) => {
			containerCreate.on("connected", () => {
				resolve();
			});
		});

		const initialObjectsCreate = containerCreate.initialObjects;
		const map1Create = initialObjectsCreate.map1;
		map1Create.set("new-key", "new-value");
		const valueCreate = await map1Create.get("new-key");
		// Make sure the op round tripped
		await timeoutPromise((resolve, reject) => {
			if (!containerCreate.isDirty) {
				resolve();
			}
			containerCreate.on("saved", () => {
				resolve();
			});
		});

		const { container: containerGet } = await tinyliciousClient.getContainer(
			containerId,
			schema,
		);
		// Make sure the container get the changed state
		await timeoutPromise((resolve, reject) => {
			containerGet.on("connected", () => {
				resolve();
			});
		});
		const map1Get = containerGet.initialObjects.map1;
		const valueGet = await map1Get.get("new-key");
		assert.strictEqual(valueGet, valueCreate, "container can't connect with initial objects");
	});

	/**
	 * Scenario: test if the optional schema parameter, dynamicObjectTypes (DDS),
	 * can be added during runtime and be returned by the container.
	 *
	 * Expected behavior: added loadable object can be retrieved from the container. Loadable
	 * object's id and containerConfig ID should be identical since it's now attached to
	 * the container.
	 */
	it("can create/add loadable objects (DDS) dynamically during runtime", async () => {
		const dynamicSchema = {
			initialObjects: {
				map1: SharedMap,
			},
			dynamicObjectTypes: [SharedDirectory],
		} satisfies ContainerSchema;

		const { container } = await tinyliciousClient.createContainer(dynamicSchema);
		await container.attach();
		await new Promise<void>((resolve, reject) => {
			container.on("connected", () => {
				resolve();
			});
		});

		const map1 = container.initialObjects.map1;
		const newPair = await container.create(SharedDirectory);
		map1.set("newpair-id", newPair.handle);
		const obj = await map1.get("newpair-id").get();
		assert.strictEqual(
			obj[Symbol.toStringTag],
			"SharedDirectory",
			"container added dynamic objects incorrectly",
		);
	});

	/**
	 * Scenario: test if the optional schema parameter, dynamicObjectTypes (custom data objects),
	 * can be added during runtime and be returned by the container.
	 *
	 * Expected behavior: added loadable object can be retrieved from the container. Loadable
	 * object's id and containerConfig ID should be identical since it's now attached to
	 * the container.
	 */
	it("can create/add loadable objects (custom data object) dynamically during runtime", async () => {
		const dynamicSchema = {
			initialObjects: {
				map1: SharedMap,
			},
			dynamicObjectTypes: [TestDataObject],
		} satisfies ContainerSchema;

		const { container: createFluidContainer } =
			await tinyliciousClient.createContainer(dynamicSchema);
		await createFluidContainer.attach();
		await new Promise<void>((resolve, reject) => {
			createFluidContainer.on("connected", () => {
				resolve();
			});
		});

		const newPair = await createFluidContainer.create(TestDataObject);
		assert.ok(newPair?.handle);

		const map1 = createFluidContainer.initialObjects.map1;
		map1.set("newpair-id", newPair.handle);
		const obj = await map1.get("newpair-id").get();
		assert.ok(obj, "container added dynamic objects incorrectly");
	});

	/**
	 * Scenario: test if FluidContainer emits error events with appropriate error type.
	 *
	 * Expected behavior: Injecting faulty op should force FluidContainer to close, while emitting
	 * error event.
	 */
	it("can process data corruption events", async () => {
		const dynamicSchema = {
			initialObjects: {
				do1: TestDataObject,
			},
		} satisfies ContainerSchema;

		const { container: createFluidContainer } =
			await tinyliciousClient.createContainer(dynamicSchema);
		await createFluidContainer.attach();
		await new Promise<void>((resolve, reject) => {
			createFluidContainer.on("connected", () => {
				resolve();
			});
		});

		const do1 = createFluidContainer.initialObjects.do1;
		const dataCorruption = allDataCorruption([createFluidContainer]);
		await corruptedAliasOp(runtimeOf(do1), "alias");
		assert(await dataCorruption);
	});

	/**
	 * Scenario: Test if TinyliciousClient with only read permission starts the container in read mode.
	 * TinyliciousClient will attempt to start the connection in write mode, and since access permissions
	 * does not offer write capabilities, the established connection mode will be `read`.
	 *
	 * Expected behavior: TinyliciousClient should start the container with the connectionMode in `read`.
	 */
	it("can create a container with only read permission in read mode", async () => {
		const tokenProvider = new InsecureTinyliciousTokenProvider([ScopeType.DocRead]);
		const client = new TinyliciousClient({ connection: { tokenProvider } });

		const { container } = await client.createContainer(schema);
		const containerId = await container.attach();
		await timeoutPromise((resolve) => container.once("connected", resolve), {
			durationMs: 1000,
			errorMsg: "container connect() timeout",
		});
		const { container: containerGet } = await client.getContainer(containerId, schema);

		assert.strictEqual(
			connectionModeOf(container),
			"read",
			"Creating a container with only read permission is not in read mode",
		);

		assert.strictEqual(
			connectionModeOf(containerGet),
			"read",
			"Getting a container with only read permission is not in read mode",
		);
	});

	/**
	 * Scenario: Test if TinyliciousClient with read and write permissions starts the container in write mode.
	 * TinyliciousClient will attempt to start the connection in write mode, and since access permissions
	 * offer write capability, the established connection mode will be `write`.
	 *
	 * Expected behavior: TinyliciousClient should start the container with the connectionMode in `write`
	 */
	it("can create a container with read and write permissions in write mode", async () => {
		const tokenProvider = new InsecureTinyliciousTokenProvider([
			ScopeType.DocRead,
			ScopeType.DocWrite,
		]);
		const client = new TinyliciousClient({ connection: { tokenProvider } });

		const { container } = await client.createContainer(schema);
		const containerId = await container.attach();
		await timeoutPromise((resolve) => container.once("connected", resolve), {
			durationMs: 1000,
			errorMsg: "container connect() timeout",
		});
		const { container: containerGet } = await client.getContainer(containerId, schema);

		assert.strictEqual(
			connectionModeOf(container),
			"write",
			"Creating a container with only write permission is not in write mode",
		);

		assert.strictEqual(
			connectionModeOf(containerGet),
			"write",
			"Getting a container with only write permission is not in write mode",
		);
	});

	/**
	 * Scenario: Ensure that the types of 'initialObjects' are preserved when the container
	 * schema type is statically known.
	 */
	it("preserves types of 'initialObjects'", async () => {
		const { container } = await tinyliciousClient.createContainer({
			initialObjects: {
				map1: SharedMap,
			},
		});

		// Ensure that the 'map1' API is accessible without casting or suppressing lint rules:
		assert.equal(container.initialObjects.map1.get("nonexistent"), undefined);
	});
});
