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

	it("Container waits for storage fetch before transitioning to Connected", async () => {
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
		let connectionStateWhenFetchStarted: ConnectionState | undefined;
		// eslint-disable-next-line prefer-const
		let containerRef: { current: IContainer | undefined } = { current: undefined };

		const trackingFactory = createStorageTrackingFactory(documentServiceFactory, {
			onFetchMessagesStart: () => {
				connectionStateWhenFetchStarted = containerRef.current?.connectionState;
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
		});

		// Wait for fetch to start (it will block on fetchDeferred)
		await fetchStartedDeferred.promise;

		// Fetch started but should not be completed while blocked
		assert.strictEqual(
			storageFetchCompleted,
			false,
			"Storage fetch should not have completed yet",
		);

		// Now resolve the deferred to allow the fetch to complete
		fetchDeferred.resolve();

		// Wait for the container to finish loading
		const loadedContainer = await loadPromise;
		containerRef.current = loadedContainer;

		// Wait for container to be connected
		await waitForContainerConnection(loadedContainer);

		// Verify the container is connected and fetch completed
		assert.strictEqual(storageFetchCompleted, true, "Storage fetch should have completed");
		assert.strictEqual(
			loadedContainer.connectionState,
			ConnectionState.Connected,
			"Container should be in Connected state",
		);

		// When fetch started, container should NOT have been Connected yet
		assert.notStrictEqual(
			connectionStateWhenFetchStarted,
			ConnectionState.Connected,
			"Container should not be Connected when storage fetch starts",
		);

		loadedContainer.close();
		await deltaConnectionServer.webSocketServer.close();
	});

	it("Container respects DisableStorageFetchWait config flag", async () => {
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

		// Load with opt-out flag
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

		// Wait for connection - should still reach Connected state
		await waitForContainerConnection(loadedContainer);

		assert.strictEqual(
			loadedContainer.connectionState,
			ConnectionState.Connected,
			"Container should reach Connected state with opt-out flag",
		);

		loadedContainer.close();
		await deltaConnectionServer.webSocketServer.close();
	});

	it("Connected state is delayed until storage fetch completes", async () => {
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

		// Verify order: fetch should complete before or at the same time as connected
		const fetchEndIndex = events.indexOf("fetch_end");
		const connectedIndex = events.indexOf("connected");

		assert.ok(fetchEndIndex !== -1, "fetch_end event should have occurred");
		assert.ok(connectedIndex !== -1, "connected event should have occurred");
		assert.ok(
			fetchEndIndex <= connectedIndex,
			`Storage fetch should complete before Connected state. Events: ${events.join(", ")}`,
		);

		loadedContainer.close();
		await deltaConnectionServer.webSocketServer.close();
	});

	it("Container is not in Connected state while storage fetch is pending", async () => {
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

		// Use deferred to block fetch and track state
		const fetchDeferred = new Deferred<void>();
		const fetchStartedDeferred = new Deferred<void>();
		let containerStateWhenFetchStarted: ConnectionState | undefined;
		// eslint-disable-next-line prefer-const
		let containerRef: { current: IContainer | undefined } = { current: undefined };

		const trackingFactory = createStorageTrackingFactory(documentServiceFactory, {
			onFetchMessagesStart: () => {
				// Capture container state when fetch starts (while blocked)
				containerStateWhenFetchStarted = containerRef.current?.connectionState;
				fetchStartedDeferred.resolve();
			},
			blockUntilResolved: fetchDeferred.promise,
		});

		const loadProps: ILoaderProps = {
			...loaderProps,
			documentServiceFactory: trackingFactory,
		};

		// Start loading
		const loadPromise = loadExistingContainer({
			...loadProps,
			request: { url: documentLoadUrl },
		});

		// Wait for fetch to start (container is now blocked)
		await fetchStartedDeferred.promise;

		// Resolve fetch to let load complete
		fetchDeferred.resolve();

		const loadedContainer = await loadPromise;
		containerRef.current = loadedContainer;

		await waitForContainerConnection(loadedContainer);

		// When fetch started, container should NOT have been in Connected state
		assert.notStrictEqual(
			containerStateWhenFetchStarted,
			ConnectionState.Connected,
			"Container should not be Connected when storage fetch starts",
		);

		assert.strictEqual(
			loadedContainer.connectionState,
			ConnectionState.Connected,
			"Container should be Connected after fetch completes",
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
