/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { IContainer } from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import {
	loadExistingContainer,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import type { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import { Deferred } from "@fluidframework/core-utils/internal";
import type { IStream } from "@fluidframework/driver-definitions/internal";
import {
	LocalDocumentServiceFactory,
	createLocalResolverCreateNewRequest,
} from "@fluidframework/local-driver/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
	createAndAttachContainerUsingProps,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { createLoader } from "../utils.js";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

/**
 * Creates a proxy over the document service factory that intercepts storage operations.
 * This allows tracking when storage fetch operations start and complete.
 * Uses direct method overriding pattern to avoid type assertion issues.
 */
function createStorageTrackingFactory(
	baseFactory: LocalDocumentServiceFactory,
	options: {
		onDeltaStorageConnected?: () => void;
		onFetchMessagesStart?: () => void;
		onFetchMessagesEnd?: () => void;
		/** Promise that blocks the fetch until resolved - use for deterministic test control */
		blockUntilResolved?: Promise<void>;
	} = {},
): LocalDocumentServiceFactory {
	const {
		onDeltaStorageConnected,
		onFetchMessagesStart,
		onFetchMessagesEnd,
		blockUntilResolved,
	} = options;

	const originalCreateDocService = baseFactory.createDocumentService.bind(baseFactory);

	baseFactory.createDocumentService = async (...args) => {
		const service = await originalCreateDocService(...args);
		const originalConnectToDeltaStorage = service.connectToDeltaStorage.bind(service);

		service.connectToDeltaStorage = async () => {
			const deltaStorage = await originalConnectToDeltaStorage();
			onDeltaStorageConnected?.();

			const originalFetchMessages = deltaStorage.fetchMessages.bind(deltaStorage);

			deltaStorage.fetchMessages = (from, to, abortSignal, cachedOnly, fetchReason) => {
				onFetchMessagesStart?.();

				const originalStream = originalFetchMessages(
					from,
					to,
					abortSignal,
					cachedOnly,
					fetchReason,
				);

				if (blockUntilResolved === undefined) {
					// No blocking - just wrap the stream to track completion
					return wrapStreamWithCompletion(originalStream, onFetchMessagesEnd);
				}

				// Create a blocked stream that waits for the promise before reading
				return createBlockedStream(originalStream, blockUntilResolved, onFetchMessagesEnd);
			};

			return deltaStorage;
		};

		return service;
	};

	return baseFactory;
}

/**
 * Wraps a stream to call a callback when the stream completes.
 */
function wrapStreamWithCompletion<T>(stream: IStream<T>, onComplete?: () => void): IStream<T> {
	return {
		read: async () => {
			const result = await stream.read();
			if (result.done) {
				onComplete?.();
			}
			return result;
		},
	};
}

/**
 * Creates a stream that blocks until a promise resolves before yielding results.
 */
function createBlockedStream<T>(
	originalStream: IStream<T>,
	blockUntil: Promise<void>,
	onComplete?: () => void,
): IStream<T> {
	let blocked = true;

	return {
		read: async () => {
			if (blocked) {
				blocked = false;
				await blockUntil;
			}
			const result = await originalStream.read();
			if (result.done) {
				onComplete?.();
			}
			return result;
		},
	};
}

describe("Storage fetch wait for Connected state", () => {
	const documentId = "storageFetchWaitTest";
	const documentLoadUrl = `https://localhost/${documentId}`;

	it("Read connection is not Connected while storage fetch is blocked", async () => {
		// Setup: Create server and initial container
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		const { loaderProps, codeDetails, documentServiceFactory } = createLoader({
			deltaConnectionServer,
		});

		// Create and attach a container to establish the document
		const initialContainer = await createAndAttachContainerUsingProps(
			{ ...loaderProps, codeDetails },
			createLocalResolverCreateNewRequest(documentId),
		);
		await waitForContainerConnection(initialContainer);
		initialContainer.close();

		// Use deferred promises to control test flow
		const fetchDeferred = new Deferred<void>();
		const fetchStartedDeferred = new Deferred<void>();
		let storageFetchCompleted = false;
		const containerRef: { current: IContainer | undefined } = { current: undefined };

		const trackingFactory = createStorageTrackingFactory(documentServiceFactory, {
			onFetchMessagesStart: () => {
				fetchStartedDeferred.resolve();
			},
			onFetchMessagesEnd: () => {
				storageFetchCompleted = true;
			},
			blockUntilResolved: fetchDeferred.promise,
		});

		// Load existing container with tracking factory
		const loadProps: ILoaderProps = {
			...loaderProps,
			documentServiceFactory: trackingFactory,
		};

		// Start loading - this will block on the fetch
		const loadPromise = loadExistingContainer({
			...loadProps,
			request: { url: documentLoadUrl },
		}).then((container) => {
			containerRef.current = container;
			return container;
		});

		// Wait for fetch to start (it will block on fetchDeferred)
		await fetchStartedDeferred.promise;

		// Fetch started but should not be completed while blocked
		assert.strictEqual(
			storageFetchCompleted,
			false,
			"Storage fetch should not have completed yet",
		);

		// KEY VALIDATION: Capture state right before resolving fetch
		// This is the critical point - container should NOT be connected while fetch is pending
		const connectionStateBeforeFetchResolved = containerRef.current?.connectionState;

		// The key assertion: container is NOT Connected while fetch is blocked
		// Note: container might be undefined if load hasn't returned yet, or in CatchingUp state
		assert.notStrictEqual(
			connectionStateBeforeFetchResolved,
			ConnectionState.Connected,
			"Container should not be Connected while storage fetch is pending",
		);

		// Now resolve the deferred to allow the fetch to complete
		fetchDeferred.resolve();

		// Wait for the container to finish loading
		const loadedContainer = await loadPromise;

		// Wait for container to be connected
		await waitForContainerConnection(loadedContainer);

		// Verify the container is connected and fetch completed
		assert.strictEqual(storageFetchCompleted, true, "Storage fetch should have completed");
		assert.strictEqual(
			loadedContainer.connectionState,
			ConnectionState.Connected,
			"Container should be in Connected state after fetch completes",
		);

		loadedContainer.close();
		await deltaConnectionServer.webSocketServer.close();
	});

	it("Opt-out flag allows container to connect without waiting for storage fetch", async () => {
		// Setup
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		const { loaderProps, codeDetails } = createLoader({
			deltaConnectionServer,
		});

		// Create initial container
		const createContainer = await createAndAttachContainerUsingProps(
			{ ...loaderProps, codeDetails },
			createLocalResolverCreateNewRequest(documentId),
		);
		await waitForContainerConnection(createContainer);
		createContainer.close();

		// Load with opt-out flag - container should connect without waiting for storage fetch
		const loadProps: ILoaderProps = {
			...loaderProps,
			configProvider: configProvider({
				"Fluid.Container.DisableStorageFetchWait": true,
			}),
		};

		const loadedContainer = await loadExistingContainer({
			...loadProps,
			request: { url: documentLoadUrl },
		});

		// With opt-out flag, container should reach Connected state
		await waitForContainerConnection(loadedContainer);

		assert.strictEqual(
			loadedContainer.connectionState,
			ConnectionState.Connected,
			"Container should reach Connected state with opt-out flag",
		);

		loadedContainer.close();
		await deltaConnectionServer.webSocketServer.close();
	});

	it("fetch_end event occurs before connected event (event ordering)", async () => {
		// Setup
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		const { loaderProps, codeDetails, documentServiceFactory } = createLoader({
			deltaConnectionServer,
		});

		// Create initial container
		const initialContainer = await createAndAttachContainerUsingProps(
			{ ...loaderProps, codeDetails },
			createLocalResolverCreateNewRequest(documentId),
		);
		await waitForContainerConnection(initialContainer);
		initialContainer.close();

		// Use deferred promises to control test flow
		const fetchDeferred = new Deferred<void>();
		const fetchStartedDeferred = new Deferred<void>();
		const events: string[] = [];

		const trackingFactory = createStorageTrackingFactory(documentServiceFactory, {
			onFetchMessagesStart: () => {
				events.push("fetch_start");
				fetchStartedDeferred.resolve();
			},
			onFetchMessagesEnd: () => {
				events.push("fetch_end");
			},
			blockUntilResolved: fetchDeferred.promise,
		});

		const loadProps: ILoaderProps = {
			...loaderProps,
			documentServiceFactory: trackingFactory,
		};

		// Start loading - this will block on the fetch
		const loadPromise = loadExistingContainer({
			...loadProps,
			request: { url: documentLoadUrl },
		}).then((container) => {
			// Track connection event immediately when container is available
			container.on("connected", () => {
				events.push("connected");
			});
			// Check if already connected
			if (container.connectionState === ConnectionState.Connected) {
				events.push("connected");
			}
			return container;
		});

		// Wait for fetch to start (it will block on fetchDeferred)
		await fetchStartedDeferred.promise;

		// Verify fetch started but container is not connected yet
		assert.ok(events.includes("fetch_start"), "fetch_start should have occurred");
		assert.ok(!events.includes("fetch_end"), "fetch_end should not have occurred yet");
		assert.ok(!events.includes("connected"), "connected should not have occurred yet");

		// Now resolve the deferred to allow the fetch to complete
		fetchDeferred.resolve();

		// Wait for container to finish loading
		const loadedContainer = await loadPromise;

		// Wait for connection
		await waitForContainerConnection(loadedContainer);

		// Verify order: fetch_end should occur before or at the same time as connected
		const fetchEndIndex = events.indexOf("fetch_end");
		const connectedIndex = events.indexOf("connected");

		assert.ok(fetchEndIndex !== -1, "fetch_end event should have occurred");
		assert.ok(connectedIndex !== -1, "connected event should have occurred");
		assert.ok(
			fetchEndIndex <= connectedIndex,
			`fetch_end should occur before connected event. Events: ${events.join(", ")}`,
		);

		loadedContainer.close();
		await deltaConnectionServer.webSocketServer.close();
	});

	it("Container can disconnect and reconnect successfully", async () => {
		// Setup
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		const { loaderProps, codeDetails } = createLoader({
			deltaConnectionServer,
		});

		// Create initial container
		const initialContainer = await createAndAttachContainerUsingProps(
			{ ...loaderProps, codeDetails },
			createLocalResolverCreateNewRequest(documentId),
		);
		await waitForContainerConnection(initialContainer);
		initialContainer.close();

		// Load container (no blocking needed for this test)
		const loadedContainer = await loadExistingContainer({
			...loaderProps,
			request: { url: documentLoadUrl },
		});

		await waitForContainerConnection(loadedContainer);

		assert.strictEqual(
			loadedContainer.connectionState,
			ConnectionState.Connected,
			"Container should be Connected initially",
		);

		// Disconnect
		loadedContainer.disconnect();

		assert.strictEqual(
			loadedContainer.connectionState,
			ConnectionState.Disconnected,
			"Container should be Disconnected after disconnect()",
		);

		// Reconnect
		loadedContainer.connect();

		// Wait for reconnection
		await waitForContainerConnection(loadedContainer);

		assert.strictEqual(
			loadedContainer.connectionState,
			ConnectionState.Connected,
			"Container should be Connected after reconnect",
		);

		loadedContainer.close();
		await deltaConnectionServer.webSocketServer.close();
	});

	it("Handles storage fetch error gracefully", async () => {
		// Setup
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		const { loaderProps, codeDetails } = createLoader({
			deltaConnectionServer,
		});

		// Create initial container
		const initialContainer = await createAndAttachContainerUsingProps(
			{ ...loaderProps, codeDetails },
			createLocalResolverCreateNewRequest(documentId),
		);
		await waitForContainerConnection(initialContainer);
		initialContainer.close();

		// Create a new factory for the error case and mutate it directly
		const { documentServiceFactory: errorFactory } = createLoader({
			deltaConnectionServer,
		});
		const originalCreateDocService = errorFactory.createDocumentService.bind(errorFactory);
		errorFactory.createDocumentService = async (...args) => {
			const service = await originalCreateDocService(...args);
			const originalConnectToDeltaStorage = service.connectToDeltaStorage.bind(service);
			service.connectToDeltaStorage = async () => {
				const deltaStorage = await originalConnectToDeltaStorage();
				return {
					...deltaStorage,
					fetchMessages: () => ({
						read: async () => {
							throw new Error("Simulated storage fetch error");
						},
					}),
				};
			};
			return service;
		};

		const loadProps: ILoaderProps = {
			...loaderProps,
			documentServiceFactory: errorFactory,
		};

		// The storage fetch error should cause the load to fail
		await assert.rejects(
			async () => {
				await loadExistingContainer({
					...loadProps,
					request: { url: documentLoadUrl },
				});
			},
			(error: Error) => {
				assert.ok(
					error.message.includes("Simulated storage fetch error"),
					`Expected error message to contain "Simulated storage fetch error", got: ${error.message}`,
				);
				return true;
			},
			"Load should fail with storage fetch error",
		);

		await deltaConnectionServer.webSocketServer.close();
	});
});
