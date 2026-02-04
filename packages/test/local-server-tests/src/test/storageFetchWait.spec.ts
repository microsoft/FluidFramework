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
import type { IStream } from "@fluidframework/driver-definitions/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
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
	deltaConnectionServer: ReturnType<typeof LocalDeltaConnectionServer.create>,
	options: {
		onDeltaStorageConnected?: () => void;
		onFetchMessagesStart?: () => void;
		onFetchMessagesEnd?: () => void;
		delayFetchMs?: number;
	} = {},
): LocalDocumentServiceFactory {
	const { onDeltaStorageConnected, onFetchMessagesStart, onFetchMessagesEnd, delayFetchMs } =
		options;

	const factory = new LocalDocumentServiceFactory(deltaConnectionServer);
	const originalCreateDocService = factory.createDocumentService.bind(factory);

	factory.createDocumentService = async (...args) => {
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

				if (delayFetchMs === undefined || delayFetchMs === 0) {
					// Wrap the stream to track completion
					return wrapStreamWithCompletion(originalStream, onFetchMessagesEnd);
				}

				// Create a delayed stream
				return createDelayedStream(originalStream, delayFetchMs, onFetchMessagesEnd);
			};

			return deltaStorage;
		};

		return service;
	};

	return factory;
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
 * Creates a stream that delays yielding results.
 */
function createDelayedStream<T>(
	originalStream: IStream<T>,
	delayMs: number,
	onComplete?: () => void,
): IStream<T> {
	let firstRead = true;

	return {
		read: async () => {
			if (firstRead) {
				firstRead = false;
				await new Promise((resolve) => setTimeout(resolve, delayMs));
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
		const baseFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
		const urlResolver = new LocalResolver();

		const { loaderProps, codeDetails } = createLoader({
			deltaConnectionServer,
			documentServiceFactory: baseFactory,
			urlResolver,
		});

		// Create and attach a container to establish the document
		const initialContainer = await createAndAttachContainerUsingProps(
			{ ...loaderProps, codeDetails },
			createLocalResolverCreateNewRequest(documentId),
		);
		await waitForContainerConnection(initialContainer);
		initialContainer.close();

		// Track storage fetch timing - use a container ref that can be set later
		let storageFetchStarted = false;
		let storageFetchCompleted = false;
		let connectionStateWhenFetchStarted: ConnectionState | undefined;
		// eslint-disable-next-line prefer-const
		let containerRef: { current: IContainer | undefined } = { current: undefined };

		const trackingFactory = createStorageTrackingFactory(deltaConnectionServer, {
			onFetchMessagesStart: () => {
				storageFetchStarted = true;
				connectionStateWhenFetchStarted = containerRef.current?.connectionState;
			},
			onFetchMessagesEnd: () => {
				storageFetchCompleted = true;
			},
			delayFetchMs: 50, // Add small delay to ensure we can observe timing
		});

		// Load existing container with tracking factory
		const loadProps: ILoaderProps = {
			...loaderProps,
			documentServiceFactory: trackingFactory,
		};

		const loadedContainer = await loadExistingContainer({
			...loadProps,
			request: { url: documentLoadUrl },
		});
		containerRef.current = loadedContainer;

		// Wait for container to be connected
		await waitForContainerConnection(loadedContainer);

		// Verify the timing: storage fetch should have completed before Connected state
		assert.strictEqual(storageFetchStarted, true, "Storage fetch should have started");
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
		const baseFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
		const urlResolver = new LocalResolver();

		const { loaderProps, codeDetails } = createLoader({
			deltaConnectionServer,
			documentServiceFactory: baseFactory,
			urlResolver,
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

	it("Connected state is delayed until storage fetch completes with delayed storage", async () => {
		// Setup
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const baseFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
		const urlResolver = new LocalResolver();

		const { loaderProps, codeDetails } = createLoader({
			deltaConnectionServer,
			documentServiceFactory: baseFactory,
			urlResolver,
		});

		// Create initial container
		const initialContainer = await createAndAttachContainerUsingProps(
			{ ...loaderProps, codeDetails },
			createLocalResolverCreateNewRequest(documentId),
		);
		await waitForContainerConnection(initialContainer);
		initialContainer.close();

		// Track exact timing of state transitions
		const events: string[] = [];
		let resolveStorageFetch: (() => void) | undefined;
		const storageFetchPromise = new Promise<void>((resolve) => {
			resolveStorageFetch = resolve;
		});

		const trackingFactory = createStorageTrackingFactory(deltaConnectionServer, {
			onFetchMessagesStart: () => {
				events.push("fetch_start");
			},
			onFetchMessagesEnd: () => {
				events.push("fetch_end");
				resolveStorageFetch?.();
			},
			delayFetchMs: 100, // Significant delay
		});

		const loadProps: ILoaderProps = {
			...loaderProps,
			documentServiceFactory: trackingFactory,
		};

		const loadedContainer = await loadExistingContainer({
			...loadProps,
			request: { url: documentLoadUrl },
		});

		// Check if already connected (event already fired during load)
		if (loadedContainer.connectionState === ConnectionState.Connected) {
			events.push("connected");
		} else {
			// Track connection state changes if not yet connected
			loadedContainer.on("connected", () => {
				events.push("connected");
			});
		}

		// Wait for both storage fetch and connection
		await Promise.all([storageFetchPromise, waitForContainerConnection(loadedContainer)]);

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

	it("Handles storage fetch error gracefully", async () => {
		// Setup
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const baseFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
		const urlResolver = new LocalResolver();

		const { loaderProps, codeDetails } = createLoader({
			deltaConnectionServer,
			documentServiceFactory: baseFactory,
			urlResolver,
		});

		// Create initial container
		const initialContainer = await createAndAttachContainerUsingProps(
			{ ...loaderProps, codeDetails },
			createLocalResolverCreateNewRequest(documentId),
		);
		await waitForContainerConnection(initialContainer);
		initialContainer.close();

		// Create factory that throws error during fetch - mutate the factory directly
		const errorFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
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
