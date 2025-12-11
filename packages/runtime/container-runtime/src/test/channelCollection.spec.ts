/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import type { FluidObject } from "@fluidframework/core-interfaces";
import type {
	ISnapshotTree,
	ISequencedDocumentMessage,
	ITree,
} from "@fluidframework/driver-definitions/internal";
import type {
	IAttachMessage,
	IRuntimeMessageCollection,
	IRuntimeStorageService,
} from "@fluidframework/runtime-definitions/internal";
import { channelsTreeName } from "@fluidframework/runtime-definitions/internal";
import {
	DataCorruptionError,
	DataProcessingError,
	MockLogger,
} from "@fluidframework/telemetry-utils/internal";

import {
	ChannelCollection,
	detectOutboundReferences,
	getSummaryForDatastores,
	type IFluidRootParentContextPrivate,
} from "../channelCollection.js";
import { LocalFluidDataStoreContext } from "../dataStoreContext.js";
import { ContainerMessageType } from "../messageTypes.js";
import { type IContainerRuntimeMetadata, nonDataStorePaths } from "../summary/index.js";

import {
	createParentContext,
	createSummarizerNodeAndGetCreateFn,
} from "./dataStoreCreationHelper.js";

describe("Runtime", () => {
	describe("ChannelCollection", () => {
		describe("getSummaryForDatastores", () => {
			const enabledMetadata: IContainerRuntimeMetadata = {
				summaryFormatVersion: 1,
				message: undefined,
			};
			const disabledMetadata: IContainerRuntimeMetadata = {
				summaryFormatVersion: 1,
				disableIsolatedChannels: true,
				message: undefined,
			};

			const emptyTree = (id: string): ISnapshotTree => ({
				id,
				blobs: {},
				trees: {},
			});
			const testSnapshot: ISnapshotTree = {
				id: "root-id",
				blobs: {},
				trees: {
					[channelsTreeName]: {
						id: "channels-id",
						blobs: {},
						trees: {
							[nonDataStorePaths[0]]: emptyTree("lower-non-datastore-1"),
							"some-datastore": emptyTree("lower-datastore-1"),
							[nonDataStorePaths[1]]: emptyTree("lower-non-datastore-2"),
							"another-datastore": emptyTree("lower-datastore-2"),
						},
					},
					[nonDataStorePaths[0]]: emptyTree("top-non-datastore-1"),
					"some-datastore": emptyTree("top-datastore-1"),
					[nonDataStorePaths[1]]: emptyTree("top-non-datastore-2"),
					"another-datastore": emptyTree("top-datastore-2"),
				},
			};

			it("Should return undefined for undefined snapshots", () => {
				let snapshot = getSummaryForDatastores(undefined, undefined);
				assert(snapshot === undefined);
				snapshot = getSummaryForDatastores(undefined, enabledMetadata);
				assert(snapshot === undefined);
				snapshot = getSummaryForDatastores(undefined, disabledMetadata);
				assert(snapshot === undefined);
				snapshot = getSummaryForDatastores(undefined, undefined);
				assert(snapshot === undefined);
				snapshot = getSummaryForDatastores(
					undefined as unknown as ISnapshotTree,
					enabledMetadata,
				);
				assert(snapshot === undefined);
				snapshot = getSummaryForDatastores(
					undefined as unknown as ISnapshotTree,
					disabledMetadata,
				);
				assert(snapshot === undefined);
			});

			it("Should strip out non-datastore paths for versions < 1", () => {
				const snapshot = getSummaryForDatastores(testSnapshot, undefined);
				assert(snapshot, "Snapshot should be defined");
				assert.strictEqual(snapshot.id, "root-id", "Should be top-level");
				assert.strictEqual(Object.keys(snapshot.trees).length, 3, "Should have 3 datastores");
				assert.strictEqual(
					snapshot.trees[channelsTreeName]?.id,
					"channels-id",
					"Should have channels tree as datastore",
				);
				assert.strictEqual(
					snapshot.trees["some-datastore"]?.id,
					"top-datastore-1",
					"Should have top datastore 1",
				);
				assert.strictEqual(
					snapshot.trees["another-datastore"]?.id,
					"top-datastore-2",
					"Should have top datastore 2",
				);
			});

			it("Should strip out non-datastore paths for disabled isolated channels", () => {
				const snapshot = getSummaryForDatastores(testSnapshot, disabledMetadata);
				assert(snapshot, "Snapshot should be defined");
				assert.strictEqual(snapshot.id, "root-id", "Should be top-level");
				assert.strictEqual(Object.keys(snapshot.trees).length, 3, "Should have 3 datastores");
				assert.strictEqual(
					snapshot.trees[channelsTreeName]?.id,
					"channels-id",
					"Should have channels tree as datastore",
				);
				assert.strictEqual(
					snapshot.trees["some-datastore"]?.id,
					"top-datastore-1",
					"Should have top datastore 1",
				);
				assert.strictEqual(
					snapshot.trees["another-datastore"]?.id,
					"top-datastore-2",
					"Should have top datastore 2",
				);
			});

			it("Should give channels subtree for version 1", () => {
				const snapshot = getSummaryForDatastores(testSnapshot, enabledMetadata);
				assert(snapshot, "Snapshot should be defined");
				assert.strictEqual(snapshot.id, "channels-id", "Should be lower-level");
				assert.strictEqual(Object.keys(snapshot.trees).length, 4, "Should have 4 datastores");
				// Put in variable to avoid type-narrowing bug
				const nonDataStore1: ISnapshotTree | undefined = snapshot.trees[nonDataStorePaths[0]];
				assert.strictEqual(
					nonDataStore1?.id,
					"lower-non-datastore-1",
					"Should have lower non-datastore 1",
				);
				assert.strictEqual(
					snapshot.trees[nonDataStorePaths[1]]?.id,
					"lower-non-datastore-2",
					"Should have lower non-datastore 2",
				);
				assert.strictEqual(
					snapshot.trees["some-datastore"]?.id,
					"lower-datastore-1",
					"Should have lower datastore 1",
				);
				assert.strictEqual(
					snapshot.trees["another-datastore"]?.id,
					"lower-datastore-2",
					"Should have lower datastore 2",
				);
			});
		});
		describe("detectOutboundReferences", () => {
			it("Can find handles", () => {
				const outboundReferences: [string, string][] = [];
				detectOutboundReferences(
					"dataStore1",
					{
						address: "dds1",
						someHandle: {
							type: "__fluid_handle__",
							url: "routeA",
						},
						nested: {
							anotherHandle: {
								type: "__fluid_handle__",
								url: "routeB",
							},
							address: "ignored",
						},
						array: [
							{
								type: "__fluid_handle__",
								url: "routeC",
							},
							{
								type: "__fluid_handle__",
								url: "routeD",
							},
						],
						// eslint-disable-next-line unicorn/no-null
						deadEnd: null,
						number: 1,
						nothing: undefined,
					},
					(from, to) => {
						outboundReferences.push([from, to]);
					},
				);
				assert.deepEqual(
					outboundReferences,
					[
						["/dataStore1/dds1", "routeA"],
						["/dataStore1/dds1", "routeB"],
						["/dataStore1/dds1", "routeC"],
						["/dataStore1/dds1", "routeD"],
					],
					"Should find both handles",
				);
			});
			it("null contents", () => {
				// eslint-disable-next-line unicorn/no-null
				detectOutboundReferences("foo", null, () => {
					assert.fail("Should not be called");
				});
			});
		});

		//* ONLY
		//* ONLY
		//* ONLY
		//* ONLY
		describe.only("processAttachMessages - Duplicate ID Detection", () => {
			/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/consistent-type-assertions */
			let channelCollection: ChannelCollection;
			let mockLogger: MockLogger;
			let parentContext: IFluidRootParentContextPrivate;

			const createMockAttachMessage = (
				id: string,
				type: string = "TestDataStore",
			): IAttachMessage => {
				const message: IAttachMessage = {
					id,
					type,
					snapshot: { id: "snapshot-id", entries: [], blobs: [] } as ITree,
				};
				return message;
			};
			const createMockMessageCollection = (
				attachMessage: IAttachMessage,
				local: boolean = false,
				sequenceNumber: number = 1,
			): IRuntimeMessageCollection => {
				const messageCollection: IRuntimeMessageCollection = {
					envelope: {
						type: ContainerMessageType.Attach,
						contents: attachMessage,
						sequenceNumber,
						clientId: local ? "local-client" : "remote-client",
						timestamp: Date.now(),
					} as ISequencedDocumentMessage,
					messagesContent: [
						{
							contents: attachMessage,
							localOpMetadata: undefined,
							clientSequenceNumber: 1,
						},
					],
					local,
				};
				return messageCollection;
			};
			beforeEach(() => {
				mockLogger = new MockLogger();
				const baseParentContext = createParentContext(mockLogger);

				// Create a proper IFluidRootParentContextPrivate with root-level submitMessage/submitSignal
				parentContext = {
					...baseParentContext,
					attachState: AttachState.Attached,
					submitMessage: (_containerRuntimeMessage: unknown, _localOpMetadata: unknown) => {},
					submitSignal: (_envelope: unknown, _targetClientId?: string) => {},
					addedGCOutboundRoute: () => {},
					makeLocallyVisible: () => {},
					getExtension: () => undefined,
					getCreateChildSummarizerNodeFn: (id: string) => {
						const fn = createSummarizerNodeAndGetCreateFn(id).createSummarizerNodeFn;
						return fn;
					},
				} as unknown as IFluidRootParentContextPrivate;

				channelCollection = new ChannelCollection(
					undefined, // baseSnapshot
					parentContext,
					mockLogger,
					() => {}, // gcNodeUpdated
					() => false, // isDataStoreDeleted
					new Map(), // aliasMap
				);
			});

			it("should throw DataProcessingError for duplicate ID with unbound (not-yet-attached) DataStore", () => {
				const dataStoreId = "test-datastore-1";

				// Create an unbound local context (not yet made visible)
				const { createSummarizerNodeFn } = createSummarizerNodeAndGetCreateFn(dataStoreId);
				const wrappedContext = (channelCollection as any).wrapContextForInnerChannel(
					dataStoreId,
				);
				const localContext = new LocalFluidDataStoreContext({
					id: dataStoreId,
					pkg: ["TestPackage"],
					parentContext: wrappedContext,
					storage: {} as unknown as IRuntimeStorageService,
					scope: {} as unknown as FluidObject,
					createSummarizerNodeFn,
					makeLocallyVisibleFn: () => {},
					snapshotTree: undefined,
				});

				// Add the context as unbound (not yet made visible)
				(channelCollection as any).contexts.addUnbound(localContext);

				// Try to process a remote attach message with the same ID
				const attachMessage = createMockAttachMessage(dataStoreId);
				const messageCollection = createMockMessageCollection(attachMessage, false);

				// Should throw DataProcessingError
				assert.throws(
					() => {
						channelCollection.processMessages(messageCollection);
					},
					(error: Error) => {
						assert(error instanceof DataProcessingError, "Expected DataProcessingError");
						assert(
							error.message.includes("Local DataStore matches remote DataStore id"),
							`Expected error message about local DataStore match, got: ${error.message}`,
						);
						return true;
					},
					"Should throw DataProcessingError for unbound context collision",
				);
			});

			it("should throw DataCorruptionError for duplicate ID with bound/attached DataStore", () => {
				const dataStoreId = "test-datastore-2";

				// Create a bound/attached context
				const { createSummarizerNodeFn } = createSummarizerNodeAndGetCreateFn(dataStoreId);
				const wrappedContext = (channelCollection as any).wrapContextForInnerChannel(
					dataStoreId,
				);
				const localContext = new LocalFluidDataStoreContext({
					id: dataStoreId,
					pkg: ["TestPackage"],
					parentContext: wrappedContext,
					storage: {} as unknown as IRuntimeStorageService,
					scope: {} as unknown as FluidObject,
					createSummarizerNodeFn,
					makeLocallyVisibleFn: () => {},
					snapshotTree: undefined,
				});

				// Set the context to Attached state and add it as bound
				localContext.setAttachState(AttachState.Attaching);
				localContext.setAttachState(AttachState.Attached);
				(channelCollection as any).contexts.addBoundOrRemoted(localContext);

				// Try to process a remote attach message with the same ID
				const attachMessage = createMockAttachMessage(dataStoreId);
				const messageCollection = createMockMessageCollection(attachMessage, false);

				// Should throw DataCorruptionError
				assert.throws(
					() => {
						channelCollection.processMessages(messageCollection);
					},
					(error: Error) => {
						assert(error instanceof DataCorruptionError, "Expected DataCorruptionError");
						assert(
							error.message.includes("Duplicate DataStore created with existing id"),
							`Expected error message about duplicate DataStore, got: ${error.message}`,
						);
						return true;
					},
					"Should throw DataCorruptionError for bound context collision",
				);
			});

			it("should throw DataCorruptionError for duplicate ID with aliased DataStore", () => {
				const dataStoreId = "test-datastore-3";
				const alias = "my-alias";

				// Create a datastore and alias it
				const { createSummarizerNodeFn } = createSummarizerNodeAndGetCreateFn(dataStoreId);
				const wrappedContext = (channelCollection as any).wrapContextForInnerChannel(
					dataStoreId,
				);
				const localContext = new LocalFluidDataStoreContext({
					id: dataStoreId,
					pkg: ["TestPackage"],
					parentContext: wrappedContext,
					storage: {} as unknown as IRuntimeStorageService,
					scope: {} as unknown as FluidObject,
					createSummarizerNodeFn,
					makeLocallyVisibleFn: () => {},
					snapshotTree: undefined,
				});

				localContext.setAttachState(AttachState.Attaching);
				localContext.setAttachState(AttachState.Attached);
				(channelCollection as any).contexts.addBoundOrRemoted(localContext);

				// Add alias mapping
				(channelCollection as any).aliasMap.set(alias, dataStoreId);

				// Try to attach with the alias
				const attachMessage = createMockAttachMessage(alias);
				const messageCollection = createMockMessageCollection(attachMessage, false);

				// Should throw DataCorruptionError
				assert.throws(
					() => {
						channelCollection.processMessages(messageCollection);
					},
					(error: Error) => {
						assert(error instanceof DataCorruptionError, "Expected DataCorruptionError");
						assert(
							error.message.includes("Duplicate DataStore created with existing id"),
							`Expected error message about duplicate DataStore, got: ${error.message}`,
						);
						return true;
					},
					"Should throw DataCorruptionError for aliased context collision",
				);
			});

			it("should not throw for local attach messages (early exit)", () => {
				const dataStoreId = "test-datastore-4";

				// Create an unbound local context
				const { createSummarizerNodeFn } = createSummarizerNodeAndGetCreateFn(dataStoreId);
				const wrappedContext = (channelCollection as any).wrapContextForInnerChannel(
					dataStoreId,
				);
				const localContext = new LocalFluidDataStoreContext({
					id: dataStoreId,
					pkg: ["TestPackage"],
					parentContext: wrappedContext,
					storage: {} as unknown as IRuntimeStorageService,
					scope: {} as unknown as FluidObject,
					createSummarizerNodeFn,
					makeLocallyVisibleFn: () => {},
					snapshotTree: undefined,
				});

				// Add the context as unbound, then transition to Attaching state
				// (this simulates what happens when makeDataStoreLocallyVisible is called)
				(channelCollection as any).contexts.addUnbound(localContext);
				localContext.setAttachState(AttachState.Attaching);
				(channelCollection as any).contexts.bind(dataStoreId);

				// Process a LOCAL attach message with the same ID (should exit early)
				const attachMessage = createMockAttachMessage(dataStoreId);
				const messageCollection = createMockMessageCollection(attachMessage, true);

				// Mark it as pending attach to simulate local attach
				(channelCollection as any).pendingAttach.set(dataStoreId, attachMessage);

				// Should not throw - local messages exit early
				assert.doesNotThrow(() => {
					channelCollection.processMessages(messageCollection);
				}, "Local attach messages should not trigger duplicate detection");

				// Verify the context transitioned to Attached state (was in Attaching, now Attached)
				const attachedContext = (channelCollection as any).contexts.get(dataStoreId);
				assert(
					attachedContext !== undefined,
					"Context should be in bound/attached collection",
				);
				assert.strictEqual(
					attachedContext.attachState,
					AttachState.Attached,
					"Context should be in Attached state",
				);
				// Verify pendingAttach was cleaned up
				assert(
					!(channelCollection as any).pendingAttach.has(dataStoreId),
					"Pending attach should be removed",
				);
			});
			it("should successfully process remote attach with no collision", () => {
				const dataStoreId = "test-datastore-5";

				// No existing context with this ID
				const attachMessage = createMockAttachMessage(dataStoreId);
				const messageCollection = createMockMessageCollection(attachMessage, false);

				// Should not throw
				assert.doesNotThrow(() => {
					channelCollection.processMessages(messageCollection);
				}, "Should successfully process attach message with unique ID");

				// Verify the context was added
				const context = (channelCollection as any).contexts.get(dataStoreId);
				assert(context !== undefined, "Context should be added to bound/remoted collection");
			});

			it("should handle multiple unbound contexts with different IDs correctly", () => {
				const dataStoreId1 = "test-datastore-6";
				const dataStoreId2 = "test-datastore-7";

				// Create two unbound contexts with different IDs
				const { createSummarizerNodeFn: createFn1 } =
					createSummarizerNodeAndGetCreateFn(dataStoreId1);
				const wrappedContext1 = (channelCollection as any).wrapContextForInnerChannel(
					dataStoreId1,
				);
				const localContext1 = new LocalFluidDataStoreContext({
					id: dataStoreId1,
					pkg: ["TestPackage"],
					parentContext: wrappedContext1,
					storage: {} as unknown as IRuntimeStorageService,
					scope: {} as unknown as FluidObject,
					createSummarizerNodeFn: createFn1,
					makeLocallyVisibleFn: () => {},
					snapshotTree: undefined,
				});

				const { createSummarizerNodeFn: createFn2 } =
					createSummarizerNodeAndGetCreateFn(dataStoreId2);
				const wrappedContext2 = (channelCollection as any).wrapContextForInnerChannel(
					dataStoreId2,
				);
				const localContext2 = new LocalFluidDataStoreContext({
					id: dataStoreId2,
					pkg: ["TestPackage"],
					parentContext: wrappedContext2,
					storage: {} as unknown as IRuntimeStorageService,
					scope: {} as unknown as FluidObject,
					createSummarizerNodeFn: createFn2,
					makeLocallyVisibleFn: () => {},
					snapshotTree: undefined,
				});

				(channelCollection as any).contexts.addUnbound(localContext1);
				(channelCollection as any).contexts.addUnbound(localContext2);

				// Process remote attach for dataStoreId1 - should throw
				const attachMessage1 = createMockAttachMessage(dataStoreId1);
				const messageCollection1 = createMockMessageCollection(attachMessage1, false);

				assert.throws(
					() => {
						channelCollection.processMessages(messageCollection1);
					},
					DataProcessingError,
					"Should throw for first ID collision",
				);

				// Process remote attach for a different ID - should succeed
				const attachMessage3 = createMockAttachMessage("test-datastore-8");
				const messageCollection3 = createMockMessageCollection(attachMessage3, false);

				assert.doesNotThrow(() => {
					channelCollection.processMessages(messageCollection3);
				}, "Should succeed for non-colliding ID");
			});
			/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/consistent-type-assertions */
		});
	});
});
