/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	IContainer,
	IContainerEvents,
} from "@fluidframework/container-definitions/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";

import { OdspContainerServices } from "../odspContainerServices.js";

/**
 * Creates a minimal mock container for testing OdspContainerServices.
 */
function createMockContainer(): IContainer {
	const emitter = new TypedEventEmitter<IContainerEvents>();
	return {
		on: emitter.on.bind(emitter),
		off: emitter.off.bind(emitter),
		readOnlyInfo: { readonly: false },
		containerMetadata: {},
		audience: {
			getMembers: () => new Map(),
			getMember: () => undefined,
			on: () => {},
			off: () => {},
		},
	} as unknown as IContainer;
}

/**
 * Creates a mock IFluidHandle for testing.
 */
function createMockHandle(): IFluidHandle {
	return {
		isAttached: true,
		get: async () => undefined,
	} as unknown as IFluidHandle;
}

describe("OdspContainerServices", () => {
	describe("lookupTemporaryBlobUrl", () => {
		it("returns undefined when no lookup callback is provided", () => {
			const container = createMockContainer();
			const services = new OdspContainerServices(container);
			const handle = createMockHandle();

			const result = services.lookupTemporaryBlobUrl(handle);

			assert.strictEqual(result, undefined);
		});

		it("delegates to the lookup callback when provided", () => {
			const container = createMockContainer();
			const expectedUrl = "https://example.sharepoint.com/_api/attachments/storageId/content";
			const lookupCallback = (): string | undefined => expectedUrl;

			const services = new OdspContainerServices(container, lookupCallback);
			const handle = createMockHandle();

			const result = services.lookupTemporaryBlobUrl(handle);

			assert.strictEqual(result, expectedUrl);
		});

		it("returns undefined when lookup callback returns undefined", () => {
			const container = createMockContainer();
			const lookupCallback = (): string | undefined => undefined;

			const services = new OdspContainerServices(container, lookupCallback);
			const handle = createMockHandle();

			const result = services.lookupTemporaryBlobUrl(handle);

			assert.strictEqual(result, undefined);
		});

		it("passes the handle to the lookup callback", () => {
			const container = createMockContainer();
			const handle = createMockHandle();
			let receivedHandle: IFluidHandle | undefined;
			const lookupCallback = (h: IFluidHandle): string | undefined => {
				receivedHandle = h;
				return "https://example.com/blob";
			};

			const services = new OdspContainerServices(container, lookupCallback);

			services.lookupTemporaryBlobUrl(handle);

			assert.strictEqual(
				receivedHandle,
				handle,
				"The exact handle object should be passed to the callback",
			);
		});
	});
});
