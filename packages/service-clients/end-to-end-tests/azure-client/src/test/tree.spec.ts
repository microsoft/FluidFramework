/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AzureClient } from "@fluidframework/azure-client";
import { ConnectionState } from "@fluidframework/container-loader";
import { timeoutPromise } from "@fluidframework/test-utils/internal";
import type { AxiosResponse } from "axios";
import {
	ContainerSchema,
	type IFluidContainer,
	SharedTree,
	Tree,
	TreeStatus,
	type Revertible,
	TreeViewConfiguration,
	SchemaFactory,
	type TreeView,
} from "fluid-framework";
// eslint-disable-next-line import/no-internal-modules -- Need asTreeViewAlpha to test it
import { asTreeViewAlpha } from "fluid-framework/alpha";

import {
	createAzureClient,
	createContainerFromPayload,
	getContainerIdFromPayloadResponse,
} from "./AzureClientFactory.js";
import * as ephemeralSummaryTrees from "./ephemeralSummaryTrees.js";
import { getTestMatrix } from "./utils.js";

const sf = new SchemaFactory("d302b84c-75f6-4ecd-9663-524f467013e3");

/**
 * Define a class that is an array of strings
 * This class is used to create an array in the SharedTree
 */
class StringArray extends sf.array("StringArray", sf.string) {
	/**
	 * Remove the first item in the list if the list is not empty
	 */
	public removeFirst(): void {
		if (this.length > 0) this.removeAt(0);
	}

	/**
	 * Add an item to the beginning of the list
	 */
	public insertNew(str: string): void {
		this.insertAtStart(str);
	}
}

/**
 * This object is passed into the SharedTree via the schematize method.
 */
const treeConfiguration = new TreeViewConfiguration(
	// Specify the root type - StringArray.
	{ schema: StringArray },
);

const testMatrix = getTestMatrix();
for (const testOpts of testMatrix) {
	describe(`SharedTree with AzureClient (${testOpts.variant})`, () => {
		const connectTimeoutMs = 10_000;
		const isEphemeral: boolean = testOpts.options.isEphemeral;
		let client: AzureClient;
		const schema = {
			initialObjects: {
				tree1: SharedTree,
			},
		} satisfies ContainerSchema;

		beforeEach("createAzureClient", () => {
			client = createAzureClient();
		});

		async function waitForConnection(container: IFluidContainer): Promise<void> {
			if (container.connectionState !== ConnectionState.Connected) {
				await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
					durationMs: connectTimeoutMs,
					errorMsg: "container1 connect() timeout",
				});
			}
		}

		/**
		 * Either creates a new azure client with a SharedTree, or loads an azure client from the existing summary tree (the "ephemeral" case).
		 */
		async function createOrLoad(
			summaryTree?: (typeof ephemeralSummaryTrees)[keyof typeof ephemeralSummaryTrees],
		): Promise<{ containerId: string; treeData: TreeView<typeof StringArray> }> {
			let containerId: string;
			let treeData: TreeView<typeof StringArray>;

			if (summaryTree === undefined) {
				const { container } = await client.createContainer(schema, "2");
				treeData = container.initialObjects.tree1.viewWith(treeConfiguration);
				treeData.initialize(new StringArray([]));
				containerId = await container.attach();
				await waitForConnection(container);
			} else {
				const containerResponse: AxiosResponse | undefined = await createContainerFromPayload(
					summaryTree,
					"test-user-id-1",
					"test-user-name-1",
				);

				containerId = getContainerIdFromPayloadResponse(containerResponse);
				const { container } = await client.getContainer(containerId, schema, "2");
				treeData = container.initialObjects.tree1.viewWith(treeConfiguration);
				await waitForConnection(container);
			}

			return {
				containerId,
				treeData,
			};
		}

		it("can create/load a container with SharedTree and do basic ops", async () => {
			const { treeData } = await createOrLoad(
				isEphemeral ? ephemeralSummaryTrees.createContainerWithSharedTree : undefined,
			);

			treeData.root.insertNew("test string 1");
			assert.strictEqual(treeData.root.length, 1);
			assert.strictEqual(treeData.root.at(0), "test string 1");

			treeData.root.insertNew("test string 2");
			assert.strictEqual(treeData.root.length, 2);
			assert.strictEqual(treeData.root.at(0), "test string 2");
			assert.strictEqual(treeData.root.at(1), "test string 1");

			treeData.root.removeFirst();
			assert.strictEqual(treeData.root.length, 1);
			assert.strictEqual(treeData.root.at(0), "test string 1");
		});

		it("can create/load a container with SharedTree collaborate with basic ops", async () => {
			const { containerId, treeData } = await createOrLoad(
				isEphemeral ? ephemeralSummaryTrees.createLoadContainerWithSharedTree : undefined,
			);

			treeData.root.insertNew("test string 1");

			const resources = client.getContainer(containerId, schema, "2");
			await assert.doesNotReject(
				resources,
				() => true,
				"container cannot be retrieved from Azure Fluid Relay",
			);
			const { container: container2 } = await resources;
			assert.deepStrictEqual(
				Object.keys(container2.initialObjects),
				Object.keys(schema.initialObjects),
			);

			if (container2.connectionState !== ConnectionState.Connected) {
				await timeoutPromise((resolve) => container2.once("connected", () => resolve()), {
					durationMs: connectTimeoutMs,
					errorMsg: "container2 connect() timeout",
				});
			}

			const treeData2 = container2.initialObjects.tree1.viewWith(treeConfiguration);
			assert.strictEqual(treeData2.root.length, 1);
			assert.strictEqual(treeData2.root.at(0), "test string 1");
		});

		if (!isEphemeral) {
			{
				class Nicknames extends sf.array("Nicknames", sf.string) {}
				class UserData extends sf.map("UserData", [sf.string, sf.number, sf.boolean]) {}
				class User extends sf.object("User", {
					name: sf.string,
					nicknames: Nicknames,
					data: UserData,
				}) {}

				it("can read and edit data", async () => {
					const { container } = await client.createContainer(schema, "2");
					await container.attach();
					const view = container.initialObjects.tree1.viewWith(
						new TreeViewConfiguration({ schema: User, enableSchemaValidation: true }),
					);

					const tags: [string, string | number | boolean][] = [
						["Age", 32],
						["Favorite Snack", "Potato Chips"],
						["Awake", true],
					];

					view.initialize(
						new User({
							name: "Pardes",
							nicknames: ["Alex", "Duder"],
							data: new Map(tags),
						}),
					);

					const user = view.root;
					// Read data
					assert.equal(user.name, "Pardes");
					assert.deepEqual([...user.nicknames], ["Alex", "Duder"]);
					assert.equal(user.data.get("Age"), 32);
					assert.equal(user.data.get("Favorite Snack"), "Potato Chips");
					assert.equal(user.data.get("Awake"), true);
					// Mutate data
					user.name = "Pardesio";
					user.nicknames.insertAt(1, "Alexp");
					user.data.set("Awake", false);
					user.data.set("Favorite Sport", "Ultimate Frisbee");
					// Read mutated data
					assert.equal(user.name, "Pardesio");
					assert.deepEqual([...user.nicknames], ["Alex", "Alexp", "Duder"]);
					assert.equal(user.data.get("Age"), 32);
					assert.equal(user.data.get("Awake"), false);
					assert.equal(user.data.get("Favorite Sport"), "Ultimate Frisbee");
				});

				it("can handle undo/redo and transactions", async () => {
					const { container } = await client.createContainer(schema, "2");
					await container.attach();
					const view = asTreeViewAlpha(
						container.initialObjects.tree1.viewWith(
							new TreeViewConfiguration({ schema: User, enableSchemaValidation: true }),
						),
					);

					view.initialize(
						new User({
							name: "Shrek",
							nicknames: ["Ogre"],
							data: new Map([["Color", "a5bf2e"]]),
						}),
					);

					const user = view.root;
					// Capture the Revertible so that changes can be undone
					let revertible: Revertible | undefined;
					view.events.on("changed", (_, getRevertible) => {
						assert(getRevertible !== undefined);
						revertible = getRevertible();
					});
					// Change a field, then revert the change
					user.name = "Donkey";
					assert.equal(user.name, "Donkey");
					assert(revertible !== undefined);
					revertible.revert();
					assert.equal(user.name, "Shrek");
					// Run a transaction which changes multiple fields, then revert it
					Tree.runTransaction(user, (u) => {
						u.name = "Donkey";
						u.nicknames.removeRange();
						u.data.set("Color", "8e8170");
					});

					assert.equal(user.name, "Donkey");
					assert.equal(user.nicknames.length, 0);
					assert.equal(user.data.get("Color"), "8e8170");
					revertible.revert();
					assert.equal(user.name, "Shrek");
					assert.equal(user.nicknames[0], "Ogre");
					assert.equal(user.data.get("Color"), "a5bf2e");
				});
			}

			it("can use identifiers and the static Tree APIs", async () => {
				class Widget extends sf.object("Widget", { id: sf.identifier }) {}

				const { container } = await client.createContainer(schema, "2");
				await container.attach();
				const view = container.initialObjects.tree1.viewWith(
					new TreeViewConfiguration({
						schema: sf.array(Widget),
						enableSchemaValidation: true,
					}),
				);

				view.initialize([new Widget({}), new Widget({ id: "fidget" })]);

				const widget = view.root.at(0);
				assert(widget !== undefined);
				const fidget = view.root.at(-1);
				assert(fidget !== undefined);
				// Test various Tree.* APIs and ensure they are working
				assert.equal(Tree.contains(view.root, widget), true);
				assert.equal(Tree.contains(fidget, widget), false);
				assert.equal(Tree.is(fidget, Widget), true);
				assert.equal(Tree.is(view.root, Widget), false);
				assert.equal(Tree.key(widget), 0);
				assert.equal(Tree.key(fidget), 1);
				assert.equal(Tree.parent(widget), view.root);
				assert.equal(Tree.schema(fidget), Widget);
				assert.equal(typeof Tree.shortId(widget), "number");
				assert.equal(Tree.shortId(fidget), "fidget");
				assert.equal(Tree.status(widget), TreeStatus.InDocument);
			});

			it("can listen to events on a recursive tree", async () => {
				class Doll extends sf.objectRecursive("Matryoshka", {
					nested: sf.optionalRecursive([() => Doll]),
				}) {}

				const { container } = await client.createContainer(schema, "2");
				await container.attach();
				const view = container.initialObjects.tree1.viewWith(
					new TreeViewConfiguration({ schema: Doll, enableSchemaValidation: true }),
				);

				// These nodes in the initial tree are unhydrated...
				const depth1 = new Doll({ nested: new Doll({}) });
				const depth0 = new Doll({ nested: depth1 });
				view.initialize(depth0);
				// ...and confirmed to be the same nodes we get when we read the tree after initialization
				assert.equal(view.root, depth0);
				assert.equal(view.root.nested, depth1);
				// Record a list of the node events fired
				const eventLog: string[] = [];
				Tree.on(depth0, "nodeChanged", () => {
					eventLog.push("depth0.nested changed");
				});
				Tree.on(depth1, "nodeChanged", () => {
					eventLog.push("depth1.nested changed");
				});
				// This event registration happens on the unhydrated (not yet inserted) node
				const newDepth2 = new Doll({});
				Tree.on(newDepth2, "nodeChanged", () => {
					eventLog.push("depth2.nested changed");
				});
				// Fire the events by doing mutations
				depth1.nested = newDepth2; // "depth1.nested changed"
				assert.equal(depth1.nested, newDepth2);
				depth1.nested.nested = new Doll({}); // "depth2.nested changed"
				depth0.nested = new Doll({}); // "depth0.nested changed"
				// Ensure the events fired in the expected order
				assert.deepEqual(eventLog, [
					"depth1.nested changed",
					"depth2.nested changed",
					"depth0.nested changed",
				]);
			});
		}
	});
}
