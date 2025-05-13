/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { AttachState } from "@fluidframework/container-definitions";
import { IChannelServices } from "@fluidframework/datastore-definitions/internal";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	Marker,
	MergeTreeDeltaRevertible,
	ReferenceType,
	Side,
	appendToMergeTreeDeltaRevertibles,
	matchProperties,
	reservedMarkerIdKey,
	reservedMarkerSimpleTypeKey,
	reservedTileLabelsKey,
	revertMergeTreeDeltaRevertibles,
} from "@fluidframework/merge-tree/internal";
import {
	MockContainerRuntimeFactory,
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	MockEmptyDeltaConnection,
	MockFluidDataStoreRuntime,
	MockStorage,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils/internal";

import { SharedStringFactory, type SharedString } from "../sequenceFactory.js";
import { SharedStringClass, getTextAndMarkers } from "../sharedString.js";

describe("SharedString", () => {
	let sharedString: SharedString;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;

	beforeEach(() => {
		dataStoreRuntime1 = new MockFluidDataStoreRuntime();
		sharedString = new SharedStringClass(
			dataStoreRuntime1,
			"shared-string-1",
			SharedStringFactory.Attributes,
		);
	});

	describe("SharedString in local state", () => {
		beforeEach(() => {
			dataStoreRuntime1.local = true;
		});

		// Creates a new SharedString and loads it from the passed snapshot tree.
		async function CreateStringAndCompare(summaryTree: ISummaryTree): Promise<void> {
			const services: IChannelServices = {
				deltaConnection: new MockEmptyDeltaConnection(),
				objectStorage: MockStorage.createFromSummary(summaryTree),
			};
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			const sharedString2 = new SharedStringClass(
				dataStoreRuntime2,
				"shared-string-2",
				SharedStringFactory.Attributes,
			);
			await sharedString2.load(services);

			assert.equal(
				sharedString.getText(),
				sharedString2.getText(),
				"Could not correctly load from snapshot",
			);
		}

		function verifyAndReturnSummaryTree(): ISummaryTree {
			const summarizeResult = sharedString.getAttachSummary();
			const summaryObjectKeys = Object.keys(summarizeResult.summary.tree);
			assert.strictEqual(summaryObjectKeys.length, 1, "summary should have one entries");
			assert.strictEqual(summaryObjectKeys[0], "content", "content not present in summary");

			const subTree = summarizeResult.summary.tree.content as ISummaryTree;
			const subTreeObjectKeys = Object.keys(subTree.tree);
			assert.strictEqual(subTreeObjectKeys.length, 1, "sub tree should have one entries");
			assert.strictEqual(subTreeObjectKeys[0], "header", "header not present in sub tree");

			return summarizeResult.summary;
		}

		it("can insert text", async () => {
			sharedString.insertText(0, "hello");
			assert.equal(sharedString.getText(), "hello", "Could not insert text at beginning");

			sharedString.insertText(5, "world");
			assert.equal(sharedString.getText(), "helloworld", "Could not insert text at end");

			sharedString.insertText(5, " ");
			assert.equal(
				sharedString.getText(),
				"hello world",
				"Could not insert text in the middle",
			);
		});

		it("can replace text", async () => {
			sharedString.insertText(0, "hello world");

			sharedString.replaceText(6, 11, "there!");
			assert.equal(sharedString.getText(), "hello there!", "Could not replace text");

			sharedString.replaceText(0, 5, "hi");
			assert.equal(sharedString.getText(), "hi there!", "Could not replace text at beginning");
		});

		it("can remove text", async () => {
			sharedString.insertText(0, "hello world");

			sharedString.removeText(5, 11);
			assert.equal(sharedString.getText(), "hello", "Could not remove text");

			sharedString.removeText(0, 3);
			assert.equal(sharedString.getText(), "lo", "Could not remove text from beginning");
		});

		it("can annotate the text", async () => {
			const text = "hello world";
			const styleProps = { style: "bold" };
			sharedString.insertText(0, text, styleProps);

			for (let i = 0; i < text.length; i++) {
				assert.deepEqual(
					{ ...sharedString.getPropertiesAtPosition(i) },
					{ ...styleProps },
					"Could not add props",
				);
			}

			const colorProps = { color: "green" };
			sharedString.annotateRange(6, text.length, colorProps);

			for (let i = 6; i < text.length; i++) {
				assert.deepEqual(
					{ ...sharedString.getPropertiesAtPosition(i) },
					{ ...styleProps, ...colorProps },
					"Could not annotate props",
				);
			}
		});

		it("can handle null annotations in text", async () => {
			const text = "hello world";
			const startingProps = { style: "bold", color: null };
			sharedString.insertText(0, text, startingProps);

			for (let i = 0; i < text.length; i++) {
				assert.strictEqual(
					sharedString.getPropertiesAtPosition(i)?.color,
					undefined,
					"Null values allowed in properties",
				);
			}
			const updatedProps = { style: null };
			sharedString.annotateRange(6, text.length, updatedProps);

			for (let i = 6; i < text.length; i++) {
				assert.strictEqual(
					sharedString.getPropertiesAtPosition(i)?.style,
					undefined,
					"Null values allowed in properties",
				);
			}
		});

		it("can handle empty annotations in text", async () => {
			const text = "hello world";
			const startingProps = Object.entries({});
			sharedString.insertText(0, text, startingProps);
			for (let i = 0; i < text.length; i++) {
				const actualProps = sharedString.getPropertiesAtPosition(i);
				assert(
					actualProps !== undefined,
					"Properties are undefined when they should be empty",
				);
				assert(
					startingProps.toString() === Object.entries(actualProps).toString(),
					`Properties are not empty at position ${i}`,
				);
			}
		});

		it("can insert marker", () => {
			sharedString.insertText(0, "hello world");
			// Insert a simple marker.
			sharedString.insertMarker(6, ReferenceType.Simple, {
				[reservedMarkerIdKey]: "markerId",
				[reservedMarkerSimpleTypeKey]: "markerKeyValue",
			});

			// Verify that the simple marker can be retrieved via id.
			const simpleMarker = sharedString.getMarkerFromId("markerId");
			assert.equal(simpleMarker?.type, "Marker", "Could not get simple marker");
			assert.equal(simpleMarker?.properties?.markerId, "markerId", "markerId is incorrect");
			assert.equal(
				simpleMarker?.properties?.markerSimpleType,
				"markerKeyValue",
				"markerSimpleType is incorrect",
			);

			// Insert a tile marker.
			sharedString.insertMarker(0, ReferenceType.Tile, {
				[reservedTileLabelsKey]: ["tileLabel"],
				[reservedMarkerIdKey]: "tileMarkerId",
			});

			// Verify that the tile marker can be retrieved via label.
			const { parallelMarkers } = getTextAndMarkers(sharedString, "tileLabel");
			const parallelMarker = parallelMarkers[0];
			assert.equal(parallelMarker.type, "Marker", "Could not get tile marker");
			assert.equal(
				parallelMarker.properties?.markerId,
				"tileMarkerId",
				"tile markerId is incorrect",
			);
		});

		it("can annotate marker", () => {
			sharedString.insertText(0, "hello world");
			// Insert a simple marker.
			sharedString.insertMarker(6, ReferenceType.Simple, {
				[reservedMarkerIdKey]: "markerId",
			});

			// Annotate the marker.
			const props = { color: "blue" };
			const simpleMarker = sharedString.getMarkerFromId("markerId") as Marker;
			sharedString.annotateMarker(simpleMarker, props);
			assert.equal(simpleMarker.properties?.color, "blue", "Could not annotate marker");
		});

		it("fails when the marker id is updated with a new string", () => {
			sharedString.insertText(0, "hello world");
			// Insert a simple marker.
			sharedString.insertMarker(6, ReferenceType.Simple, {
				[reservedMarkerIdKey]: "markerId",
			});
			// Annotate the marker.
			const props = { color: "blue" };
			const simpleMarker = sharedString.getMarkerFromId("markerId") as Marker;
			sharedString.annotateMarker(simpleMarker, props);
			assert.equal(simpleMarker.properties?.color, "blue", "Could not annotate marker");
			// Annotate the marker's ID.
			const newIdProps = { [reservedMarkerIdKey]: "newIdValue" };
			assert.throws(
				() => {
					sharedString.annotateMarker(simpleMarker, newIdProps);
				},
				(e: Error) =>
					validateAssertionError(e, "Cannot change the markerId of an existing marker"),
				"Error from attempting to update marker was not thrown or was not the expected error",
			);
		});

		it("fails when the marker id is updated with null", () => {
			sharedString.insertText(0, "hello world");
			// Insert a simple marker.
			sharedString.insertMarker(6, ReferenceType.Simple, {
				[reservedMarkerIdKey]: "markerId",
			});
			// Annotate the marker's ID.
			const simpleMarker = sharedString.getMarkerFromId("markerId") as Marker;
			const newIdProps = { [reservedMarkerIdKey]: null };

			assert.throws(
				() => {
					sharedString.annotateMarker(simpleMarker, newIdProps);
				},
				(e: Error) =>
					validateAssertionError(e, "Cannot change the markerId of an existing marker"),
				"Error from attempting to update marker was not thrown or was not the expected error",
			);
		});

		it("fails when the marker id is updated with undefined", () => {
			sharedString.insertText(0, "hello world");
			// Insert a simple marker.
			sharedString.insertMarker(6, ReferenceType.Simple, {
				[reservedMarkerIdKey]: "markerId",
			});
			// Annotate the marker's ID.
			const simpleMarker = sharedString.getMarkerFromId("markerId") as Marker;
			const newIdProps = { [reservedMarkerIdKey]: undefined };

			assert.throws(
				() => {
					sharedString.annotateMarker(simpleMarker, newIdProps);
				},
				(e: Error) =>
					validateAssertionError(e, "Cannot change the markerId of an existing marker"),
				"Error from attempting to update marker was not thrown or was not the expected error",
			);
		});

		it("allows the markerId to be updated with the existing value", () => {
			sharedString.insertText(0, "hello world");
			// Insert a simple marker.
			sharedString.insertMarker(6, ReferenceType.Simple, {
				[reservedMarkerIdKey]: "markerId",
			});
			// Annotate the marker's ID.
			const simpleMarker = sharedString.getMarkerFromId("markerId") as Marker;
			const newIdProps = { [reservedMarkerIdKey]: "markerId" };
			sharedString.annotateMarker(simpleMarker, newIdProps);
			assert.equal(
				sharedString.getMarkerFromId("markerId"),
				simpleMarker,
				"Could not update marker with the existing id value",
			);
			assert.equal(
				"markerId",
				simpleMarker.properties?.[reservedMarkerIdKey],
				`Actual value of marker id property - ${simpleMarker.properties?.[reservedMarkerIdKey]} - does not match the expected value`,
			);
		});

		it("replace zero range", async () => {
			sharedString.insertText(0, "123");
			sharedString.replaceText(1, 1, "\u00e4\u00c4");
			assert.equal(sharedString.getText(), "1\u00e4\u00c423", "Could not replace zero range");
		});

		it("replace negative range", async () => {
			sharedString.insertText(0, "123");
			sharedString.replaceText(2, 1, "aaa");
			// This assert relies on the behavior that replacement for a reversed range
			// will insert at the max end of the range but not delete the range
			assert.equal(sharedString.getText(), "12aaa3", "Could not replace negative range");
		});

		it("can load a SharedString from summary", async () => {
			const insertText = "text";
			const segmentCount = 1000;

			sharedString.initializeLocal();

			for (let i = 0; i < segmentCount; i = i + 1) {
				sharedString.insertText(0, `${insertText}${i}`);
			}

			// Verify that summary data is correct.
			let summaryTree = verifyAndReturnSummaryTree();

			// Load a new SharedString from the snapshot and verify it is loaded correctly.
			await CreateStringAndCompare(summaryTree);

			for (let i = 0; i < segmentCount; i = i + 1) {
				sharedString.insertText(0, `${insertText}-${i}`);
			}

			// TODO: Due to segment packing, we have only "header" and no body
			// Need to change test to include other types of segments (like marker) to exercise "body".

			// Verify summary after changes.
			summaryTree = verifyAndReturnSummaryTree();

			// Load a new SharedString from the snapshot and verify it is loaded correctly.
			await CreateStringAndCompare(summaryTree);
		});
	});

	describe("SharedString op processing in local state", () => {
		it("should correctly process operations sent in local state", async () => {
			// Set the data store runtime to local.
			dataStoreRuntime1.local = true;

			// Initialize the shared string so that it is completely loaded before we take a snapshot.
			sharedString.initializeLocal();

			// Insert and replace text in first shared string.
			sharedString.insertText(0, "hello world");
			sharedString.replaceText(6, 11, "there");

			// Load a new Ink in connected state from the snapshot of the first one.
			const containerRuntimeFactory = new MockContainerRuntimeFactory();
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services2: IChannelServices = {
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: MockStorage.createFromSummary(sharedString.getAttachSummary().summary),
			};

			const sharedString2 = new SharedStringClass(
				dataStoreRuntime2,
				"shared-string-2",
				SharedStringFactory.Attributes,
			);
			await sharedString2.load(services2);

			// Now connect the first Ink
			dataStoreRuntime1.setAttachState(AttachState.Attached);
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			const services1 = {
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(undefined),
			};
			sharedString.connect(services1);

			// Verify that both the shared strings have the text.
			assert.equal(
				sharedString.getText(),
				"hello there",
				"The first string does not have the text",
			);
			assert.equal(
				sharedString2.getText(),
				"hello there",
				"The second string does not have the text",
			);

			// Insert and replace text in second shared string.
			sharedString2.insertText(0, "well ");

			// Process the message.
			containerRuntimeFactory.processAllMessages();

			// Verify that both the shared strings have the new text.
			assert.equal(
				sharedString.getText(),
				"well hello there",
				"The first string does not have the text",
			);
			assert.equal(
				sharedString2.getText(),
				"well hello there",
				"The second string does not have the text",
			);
		});
	});

	describe("SharedString in connected state with a remote SharedString", () => {
		let sharedString2: SharedString;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();

			// Connect the first SharedString.
			dataStoreRuntime1.setAttachState(AttachState.Attached);
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			const services1 = {
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			sharedString.initializeLocal();
			sharedString.connect(services1);

			// Create and connect a second SharedString.
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services2 = {
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};

			sharedString2 = new SharedStringClass(
				dataStoreRuntime2,
				"shared-string-2",
				SharedStringFactory.Attributes,
			);
			sharedString2.initializeLocal();
			sharedString2.connect(services2);
		});

		it("can insert text", async () => {
			// Insert text in first shared string.
			sharedString.insertText(0, "hello");

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that both the shared strings inserted the text.
			assert.equal(sharedString.getText(), "hello", "Could not insert text at beginning");
			assert.equal(
				sharedString2.getText(),
				"hello",
				"Could not insert text at beginning in remote string",
			);

			// Insert text at the end of second shared string.
			sharedString2.insertText(5, " world");

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that both the shared strings inserted the text.
			assert.equal(sharedString.getText(), "hello world", "Could not insert text at end");
			assert.equal(
				sharedString2.getText(),
				"hello world",
				"Could not insert text at end in remote string",
			);
		});

		it("can replace text", async () => {
			// Insert and replace text in first shared string.
			sharedString.insertText(0, "hello world");
			sharedString.replaceText(6, 11, "there!");

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that both the shared strings replaced the text.
			assert.equal(sharedString.getText(), "hello there!", "Could not replace text");
			assert.equal(
				sharedString2.getText(),
				"hello there!",
				"Could not replace text in remote string",
			);
		});

		it("can remove text", async () => {
			// Insert and remove text in first shared string.
			sharedString.insertText(0, "hello world");
			sharedString.removeText(5, 11);

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that both the shared strings removed the text.
			assert.equal(sharedString.getText(), "hello", "Could not remove text");
			assert.equal(
				sharedString2.getText(),
				"hello",
				"Could not remove text from remote string",
			);
		});

		it("can annotate the text", async () => {
			// Insert text with properties in the first shared string.
			const text = "hello world";
			const styleProps = { style: "bold" };
			sharedString.insertText(0, text, styleProps);

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that both the shared strings have the properties.
			for (let i = 0; i < text.length; i++) {
				assert.deepEqual(
					{ ...sharedString.getPropertiesAtPosition(i) },
					{ ...styleProps },
					"Could not add props",
				);
				assert.deepEqual(
					{ ...sharedString2.getPropertiesAtPosition(i) },
					{ ...styleProps },
					"Could not add props to remote string",
				);
			}

			// Annotate the properties.
			const colorProps = { color: "green" };
			sharedString.annotateRange(6, text.length, colorProps);

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that both the shared strings have the annotated properties.
			for (let i = 6; i < text.length; i++) {
				assert.deepEqual(
					{ ...sharedString.getPropertiesAtPosition(i) },
					{ ...styleProps, ...colorProps },
					"Could not annotate props",
				);
				assert.deepEqual(
					{ ...sharedString2.getPropertiesAtPosition(i) },
					{ ...styleProps, ...colorProps },
					"Could not annotate props in remote string",
				);
			}
		});

		it("can insert marker", () => {
			const label = "tileLabel";
			const id = "tileMarkerId";
			const simpleKey = "tileMarkerKey";

			const verifyMarker = (marker) => {
				assert.equal(marker.type, "Marker", "Could not get simple marker");
				assert.equal(marker.properties.markerId, id, "markerId is incorrect");
				assert.equal(
					marker.properties.markerSimpleType,
					simpleKey,
					"markerSimpleType is incorrect",
				);
				assert.equal(
					marker.properties.referenceTileLabels[0],
					label,
					"markerSimpleType is incorrect",
				);
			};

			sharedString.insertText(0, "hello world");

			// Insert a tile marker.
			sharedString.insertMarker(6, ReferenceType.Tile, {
				[reservedTileLabelsKey]: [label],
				[reservedMarkerIdKey]: id,
				[reservedMarkerSimpleTypeKey]: simpleKey,
			});

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that the marker can be retrieved via id from both the shared strings.
			const simpleMarker1 = sharedString.getMarkerFromId(id);
			verifyMarker(simpleMarker1);
			const simpleMarker2 = sharedString2.getMarkerFromId(id);
			verifyMarker(simpleMarker2);

			// Verify that the marker can be retrieved via label from both the shared strings.
			const textAndMarker1 = getTextAndMarkers(sharedString, label);
			verifyMarker(textAndMarker1.parallelMarkers[0]);
			const textAndMarker2 = getTextAndMarkers(sharedString2, label);
			verifyMarker(textAndMarker2.parallelMarkers[0]);
		});

		it("can annotate marker", () => {
			sharedString.insertText(0, "hello world");
			// Insert a simple marker.
			sharedString.insertMarker(6, ReferenceType.Simple, {
				[reservedMarkerIdKey]: "markerId",
			});

			// Annotate the marker.
			const props = { color: "blue" };
			const simpleMarker = sharedString.getMarkerFromId("markerId") as Marker;
			sharedString.annotateMarker(simpleMarker, props);

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that the marker was annotated in both the shared strings.
			const simpleMarker1 = sharedString.getMarkerFromId("markerId") as Marker;
			assert.equal(simpleMarker1.properties?.color, "blue", "Could not annotate marker");

			const simpleMarker2 = sharedString.getMarkerFromId("markerId") as Marker;
			assert.equal(
				simpleMarker2.properties?.color,
				"blue",
				"Could not annotate marker in remote string",
			);
		});
	});

	describe("reconnect", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
		let containerRuntime1: MockContainerRuntimeForReconnection;
		let sharedString2: SharedString;

		beforeEach(async () => {
			containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

			// Connect the first SharedString.
			containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			const services1: IChannelServices = {
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			sharedString.initializeLocal();
			sharedString.connect(services1);

			// Create and connect a second SharedString.
			const runtime2 = new MockFluidDataStoreRuntime();
			containerRuntimeFactory.createContainerRuntime(runtime2);
			sharedString2 = new SharedStringClass(
				runtime2,
				"shared-string-2",
				SharedStringFactory.Attributes,
			);
			const services2: IChannelServices = {
				deltaConnection: runtime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			sharedString2.initializeLocal();
			sharedString2.connect(services2);
		});

		it("can resend unacked ops on reconnection", async () => {
			// Make couple of changes to the first SharedString.
			sharedString.insertText(0, "helloworld");
			sharedString.replaceText(5, 10, " friend");

			for (let i = 0; i < 10; i++) {
				// Disconnect and reconnect the first collection.
				containerRuntime1.connected = false;
				containerRuntime1.connected = true;
			}

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that the changes were correctly received by the second SharedString
			assert.equal(sharedString2.getText(), "hello friend");
		});

		it("insert in middle of multibyte character", async () => {
			let base = "🎉";

			sharedString.insertText(0, "🎉");

			assert.equal(sharedString.getText(), base);
			assert.equal(sharedString.getLength(), base.length);

			containerRuntimeFactory.processAllMessages();

			base = `${base.slice(0, 1)}a${base.slice(1)}`;
			sharedString.insertText(1, "a");

			containerRuntimeFactory.processAllMessages();

			assert.equal(sharedString.getText(), base); // not 🎉a
			assert.equal(sharedString.getLength(), base.length);
		});

		it("insert in middle of surrogate pair", async () => {
			let base = "👨🏻‍🦱";
			sharedString.insertText(0, "👨🏻‍🦱");

			assert.equal(sharedString.getText(), base);
			assert.equal(sharedString.getLength(), base.length);

			containerRuntimeFactory.processAllMessages();

			base = `${base.slice(0, 2)}a${base.slice(2)}`;
			sharedString.insertText(2, "a");

			containerRuntimeFactory.processAllMessages();

			assert.equal(sharedString.getText(), base); // not 👨🏻‍🦱a
			assert.equal(sharedString.getLength(), base.length);
		});

		it("can store ops in disconnected state and resend them on reconnection", async () => {
			// Disconnect the first SharedString.
			containerRuntime1.connected = false;

			// Make couple of changes to it.
			sharedString.insertText(0, "helloworld");
			sharedString.replaceText(5, 10, " friend");

			// Reconnect the first SharedString.
			containerRuntime1.connected = true;

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that the changes were correctly received by the second SharedString
			assert.equal(sharedString2.getText(), "hello friend");
		});
	});

	// revertibles are deeply test in the merge tree package
	// these test just validate high level integration
	describe("revertible smoke tests", () => {
		it("insert", () => {
			const revertibles: MergeTreeDeltaRevertible[] = [];
			sharedString.on("sequenceDelta", (event) =>
				appendToMergeTreeDeltaRevertibles(event.deltaArgs, revertibles),
			);
			for (let i = 0; i < 10; i++) {
				sharedString.insertText(sharedString.getLength(), i.toString());
			}
			assert.equal(sharedString.getText(), "0123456789");

			// undo all inserts
			revertMergeTreeDeltaRevertibles(sharedString, revertibles.splice(0));
			assert.equal(sharedString.getText(), "");

			// redo all inserts
			revertMergeTreeDeltaRevertibles(sharedString, revertibles.splice(0));
			assert.equal(sharedString.getText(), "0123456789");
		});

		it("remove", () => {
			sharedString.insertText(sharedString.getLength(), "hello world");
			const revertibles: MergeTreeDeltaRevertible[] = [];
			sharedString.on("sequenceDelta", (event) =>
				appendToMergeTreeDeltaRevertibles(event.deltaArgs, revertibles),
			);
			while (sharedString.getLength() > 0) {
				const middle = Math.floor(sharedString.getLength() / 2);
				sharedString.removeRange(middle, middle + 1);
			}
			assert.equal(sharedString.getText(), "");

			// undo all removes
			revertMergeTreeDeltaRevertibles(sharedString, revertibles.splice(0));
			assert.equal(sharedString.getText(), "hello world");

			// redo all removes
			revertMergeTreeDeltaRevertibles(sharedString, revertibles.splice(0));
			assert.equal(sharedString.getText(), "");
		});

		it("annotate", () => {
			sharedString.insertText(0, "hello world");
			Array.from({ length: sharedString.getLength() }).forEach((_, i) =>
				assert(matchProperties(sharedString.getPropertiesAtPosition(i), undefined)),
			);

			const revertibles: MergeTreeDeltaRevertible[] = [];
			sharedString.on("sequenceDelta", (event) =>
				appendToMergeTreeDeltaRevertibles(event.deltaArgs, revertibles),
			);

			for (let i = 0; i < sharedString.getLength(); i++) {
				sharedString.annotateRange(i, i + 1, { test: i });
			}
			assert.equal(sharedString.getText(), "hello world");
			Array.from({ length: sharedString.getLength() }).forEach((_, i) =>
				assert(matchProperties(sharedString.getPropertiesAtPosition(i), { test: i })),
			);

			// undo all annotates
			revertMergeTreeDeltaRevertibles(sharedString, revertibles.splice(0));
			assert.equal(sharedString.getText(), "hello world");
			Array.from({ length: sharedString.getLength() }).forEach((_, i) =>
				assert(matchProperties(sharedString.getPropertiesAtPosition(i), {})),
			);

			// redo all annotates
			revertMergeTreeDeltaRevertibles(sharedString, revertibles.splice(0));
			assert.equal(sharedString.getText(), "hello world");
			Array.from({ length: sharedString.getLength() }).forEach((_, i) =>
				assert(matchProperties(sharedString.getPropertiesAtPosition(i), { test: i })),
			);
		});
	});
});

describe("Shared String Obliterate", () => {
	let sharedString: SharedString;
	let dataStoreRuntime1: MockFluidDataStoreRuntime;
	let sharedString2: SharedString;
	let containerRuntimeFactory: MockContainerRuntimeFactory;

	beforeEach(() => {
		containerRuntimeFactory = new MockContainerRuntimeFactory();
		dataStoreRuntime1 = new MockFluidDataStoreRuntime();
		dataStoreRuntime1.options = {
			mergeTreeEnableObliterate: true,
			mergeTreeEnableSidedObliterate: true,
		};
		sharedString = new SharedStringClass(
			dataStoreRuntime1,
			"shared-string-1",
			SharedStringFactory.Attributes,
		);

		// Connect the first SharedString.
		dataStoreRuntime1.setAttachState(AttachState.Attached);
		containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
		const services1 = {
			deltaConnection: dataStoreRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};
		sharedString.initializeLocal();
		sharedString.connect(services1);

		// Create and connect a second SharedString.
		const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
		dataStoreRuntime2.options = {
			mergeTreeEnableObliterate: true,
			mergeTreeEnableSidedObliterate: true,
		};
		containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
		const services2 = {
			deltaConnection: dataStoreRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};

		sharedString2 = new SharedStringClass(
			dataStoreRuntime2,
			"shared-string-2",
			SharedStringFactory.Attributes,
		);
		sharedString2.initializeLocal();
		sharedString2.connect(services2);
	});

	it("zero length obliterate in the middle of the string", () => {
		sharedString.insertText(0, "0123456789");
		containerRuntimeFactory.processAllMessages();
		assert.equal(
			sharedString.getText(),
			sharedString2.getText(),
			"starting state should be equal",
		);

		sharedString.obliterateRange({ pos: 4, side: Side.After }, { pos: 5, side: Side.Before });
		sharedString.insertText(5, "AAA");
		sharedString2.obliterateRange({ pos: 4, side: Side.After }, { pos: 5, side: Side.Before });
		sharedString2.insertText(5, "BBB");

		containerRuntimeFactory.processAllMessages();
		assert.equal(
			sharedString.getText(),
			sharedString2.getText(),
			"end state should be equal after obliterate",
		);
		assert.equal(sharedString2.getText(), "01234BBB56789", "obliterate failed");
	});
});
