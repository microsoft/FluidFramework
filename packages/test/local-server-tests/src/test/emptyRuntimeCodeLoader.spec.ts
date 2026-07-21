/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	createDetachedContainer,
	createEmptyRuntimeCodeLoader,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import type {
	IDocumentDeltaConnection,
	IDocumentMessage,
	IDocumentService,
	IDocumentServiceFactory,
} from "@fluidframework/driver-definitions/internal";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
	timeoutPromise,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { createLoader } from "./utils.js";

interface OutboundCounts {
	/**
	 * Number of application ops (`MessageType.Operation`) submitted over the wire.
	 * System ops the container layer may send on its own (join, noop, ...) are excluded
	 * so the count is attributable to the runtime.
	 */
	appOps: number;
	/**
	 * Number of signals submitted over the wire.
	 */
	signals: number;
}

/**
 * Wraps a document service factory so that every application op (`submit`) and signal
 * (`submitSignal`) sent over any delta connection it creates is counted. This lets a
 * test prove that a runtime never sends anything of its own over the wire.
 */
function spyOnOutbound(inner: IDocumentServiceFactory): {
	documentServiceFactory: IDocumentServiceFactory;
	counts: OutboundCounts;
} {
	const counts: OutboundCounts = { appOps: 0, signals: 0 };

	const wrapConnection = (connection: IDocumentDeltaConnection): IDocumentDeltaConnection =>
		new Proxy(connection, {
			get: (target, prop, receiver): unknown => {
				if (prop === "submit") {
					return (messages: IDocumentMessage[]): void => {
						counts.appOps += messages.filter((m) => m.type === MessageType.Operation).length;
						target.submit(messages);
					};
				}
				if (prop === "submitSignal") {
					return (content: string, targetClientId?: string): void => {
						// Unlike ops (where the container/delta-manager sends system ops such as noops
						// directly over the connection), the loader layer has no signal path of its own:
						// Container.submitSignal is wired exclusively to the runtime's context.submitSignalFn.
						// So every signal seen here is attributable to the runtime, and no filtering is needed.
						counts.signals++;
						target.submitSignal(content, targetClientId);
					};
				}
				return Reflect.get(target, prop, receiver);
			},
		});

	const wrapService = (service: IDocumentService): IDocumentService =>
		new Proxy(service, {
			get: (target, prop, receiver): unknown => {
				if (prop === "connectToDeltaStream") {
					return async (
						...args: Parameters<IDocumentService["connectToDeltaStream"]>
					): Promise<IDocumentDeltaConnection> =>
						wrapConnection(await target.connectToDeltaStream(...args));
				}
				return Reflect.get(target, prop, receiver);
			},
		});

	const documentServiceFactory: IDocumentServiceFactory = {
		createContainer: async (...args) => wrapService(await inner.createContainer(...args)),
		createDocumentService: async (...args) =>
			wrapService(await inner.createDocumentService(...args)),
	};
	return { documentServiceFactory, counts };
}

describe("createEmptyRuntimeCodeLoader (local server)", () => {
	it("loads and connects to an existing container without a runtime, sending no ops or signals", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const { urlResolver, codeDetails, loaderProps, documentServiceFactory } = createLoader({
			deltaConnectionServer,
		});

		// Create and attach a real container so there is a document in the server to load.
		const creator = await createDetachedContainer({ codeDetails, ...loaderProps });
		await creator.attach(urlResolver.createCreateNewRequest("emptyRuntimeTest"));
		await waitForContainerConnection(creator);
		const url = await creator.getAbsoluteUrl("");
		assert(url !== undefined, "creator should provide an absolute url");

		// Load the same document with the empty runtime code loader, spying on outbound traffic.
		const { documentServiceFactory: spyFactory, counts } =
			spyOnOutbound(documentServiceFactory);
		const emptyContainer = await loadExistingContainer({
			codeLoader: createEmptyRuntimeCodeLoader(),
			documentServiceFactory: spyFactory,
			urlResolver,
			request: { url },
		});
		await waitForContainerConnection(emptyContainer);

		// The full set of IContainer capabilities is available without a runtime.
		assert(emptyContainer.clientId !== undefined, "empty container should have a clientId");
		assert.notStrictEqual(
			await emptyContainer.getEntryPoint(),
			undefined,
			"empty container should expose an entry point",
		);

		// The empty container participates in the session: it sees itself in its audience.
		await timeoutPromise(
			(resolve) => {
				const clientId = emptyContainer.clientId;
				assert(clientId !== undefined);
				if (emptyContainer.audience.getMember(clientId) !== undefined) {
					resolve();
					return;
				}
				emptyContainer.audience.on("addMember", (newClientId: string) => {
					if (newClientId === clientId) {
						resolve();
					}
				});
			},
			{ durationMs: 3000, errorMsg: "empty container's audience should contain itself" },
		);

		// Give any stray op/signal a chance to flush, then assert the runtime sent nothing.
		await new Promise((resolve) => setTimeout(resolve, 200));
		assert.strictEqual(counts.appOps, 0, "empty runtime must not send any ops");
		assert.strictEqual(counts.signals, 0, "empty runtime must not send any signals");

		emptyContainer.close();
		creator.close();
		await deltaConnectionServer.webSocketServer.close();
	});

	it("cannot create a new (detached) container because it has no summary", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const { urlResolver, codeDetails, documentServiceFactory } = createLoader({
			deltaConnectionServer,
		});

		await assert.rejects(
			async () =>
				createDetachedContainer({
					codeDetails,
					codeLoader: createEmptyRuntimeCodeLoader(),
					documentServiceFactory,
					urlResolver,
				}),
			/can only be used to load existing/,
			"creating an empty-runtime container should throw because it can only load existing containers",
		);

		await deltaConnectionServer.webSocketServer.close();
	});
});
