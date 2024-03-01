/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import {
	MockFluidDataStoreContext,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { IChannel } from "@fluidframework/datastore-definitions";
import { FluidDataStoreRuntime, ISharedObjectRegistry } from "../dataStoreRuntime.js";
import { LocalChannelContext, RehydratedLocalChannelContext } from "../localChannelContext.js";

describe("LocalChannelContext Tests", () => {
	let dataStoreContext: MockFluidDataStoreContext;
	let sharedObjectRegistry: ISharedObjectRegistry;
	const loadRuntime = (context: IFluidDataStoreContext, registry: ISharedObjectRegistry) =>
		new FluidDataStoreRuntime(context, registry, /* existing */ false, async () => ({
			myProp: "myValue",
		}));

	beforeEach(() => {
		dataStoreContext = new MockFluidDataStoreContext();
		sharedObjectRegistry = {
			get(type: string) {
				return {
					type,
					attributes: { type, snapshotFormatVersion: "0" },
					create: () => ({}) as any as IChannel,
					load: async () => Promise.resolve({} as any as IChannel),
				};
			},
		};
	});

	it("LocalChannelContext rejects ids with forward slashes", () => {
		const invalidId = "beforeSlash/afterSlash";
		const dataStoreRuntime = loadRuntime(dataStoreContext, sharedObjectRegistry);
		const codeBlock = () =>
			new LocalChannelContext(
				{ id: invalidId } as any as IChannel,
				dataStoreRuntime,
				dataStoreContext,
				dataStoreContext.storage,
				dataStoreContext.logger,
				() => {},
				(s: string) => {},
				(s) => {},
			);
		assert.throws(
			codeBlock,
			(e: Error) => validateAssertionError(e, "Channel context ID cannot contain slashes"),
			"Expected exception was not thrown",
		);
	});

	it("RehydratedLocalChannelContext rejects ids with forward slashes", () => {
		const invalidId = "beforeSlash/afterSlash";
		const dataStoreRuntime = loadRuntime(dataStoreContext, sharedObjectRegistry);
		const codeBlock = () =>
			new RehydratedLocalChannelContext(
				invalidId,
				sharedObjectRegistry,
				dataStoreRuntime,
				dataStoreContext,
				dataStoreContext.storage,
				dataStoreContext.logger,
				(content, localOpMetadata) => {},
				(s: string) => {},
				(s, o) => {},
				null as unknown as ISnapshotTree,
			);
		assert.throws(
			codeBlock,
			(e: Error) => validateAssertionError(e, "Channel context ID cannot contain slashes"),
			"Expected exception was not thrown",
		);
	});
});
