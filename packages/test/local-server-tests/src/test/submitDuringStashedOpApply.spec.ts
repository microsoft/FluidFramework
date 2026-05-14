/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	asLegacyAlpha,
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import { type ISharedMap, SharedMap } from "@fluidframework/map/internal";
import type {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { TestFluidObjectFactory } from "@fluidframework/test-utils/internal";
import type { ITestFluidObject } from "@fluidframework/test-utils/internal";

import { createLoader } from "../utils.js";

/**
 * NOTE — anti-pattern under test, do not copy.
 *
 * Submitting ops from inside DDS op-event handlers is bad practice and
 * should be avoided. Op events fire during op processing (including
 * stashed-op replay and rollback), and a cascading write inside the
 * handler can either land at the wrong moment in the op stream or be
 * silently dropped. If a cascading write is unavoidable, the handler
 * MUST gate on both:
 *   1. `IFluidDataStoreRuntime.isReadOnly()` — when `true`, the handler
 *      must not submit edits. The `"readonly"` event is the live signal.
 *   2. `IFluidDataStoreRuntime.activeLocalOperationActivity` — when set
 *      (`"applyStashed"` or `"rollback"`), the runtime itself is
 *      driving the change, not the user, and the handler should not
 *      react with new ops.
 *
 * This factory deliberately omits both gates so the load rejects with
 * the expected `UsageError`. Two SharedMaps are needed because the
 * channel-level `stashedOpMd` capture in `ChannelDeltaConnection.submit`
 * swallows any submit issued *on the same channel* while that channel's
 * `applyStashedOp` is in flight. A submit targeting a *different*
 * channel goes through the normal submit path — which is exactly the
 * "event handler on map A writes to map B" shape that reaches the
 * runtime guard in production.
 */
class ReactingMapFactory implements IFluidDataStoreFactory {
	public constructor(private readonly inner: IFluidDataStoreFactory) {}

	public get IFluidDataStoreFactory(): IFluidDataStoreFactory {
		return this;
	}
	public get type(): string {
		return this.inner.type;
	}

	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<IFluidDataStoreChannel> {
		const channel = await this.inner.instantiateDataStore(context, existing);
		if (!existing) {
			return channel;
		}
		// Eagerly realize both maps and wire up the cross-map listener.
		// `IFluidDataStoreChannel` doesn't expose `getChannel`, but the
		// concrete TestFluidObjectFactory runtime does.
		const runtimeWithChannels = channel as IFluidDataStoreChannel & {
			getChannel(id: string): Promise<unknown>;
		};
		const primary = (await runtimeWithChannels.getChannel("primary")) as ISharedMap;
		const secondary = (await runtimeWithChannels.getChannel("secondary")) as ISharedMap;
		primary.on("valueChanged", (changed) => {
			secondary.set(`mirror:${changed.key}`, "cascaded-value");
		});
		return channel;
	}
}

describe("Submit during stashed-op apply (end-to-end)", () => {
	it("rejects load when a valueChanged listener does a cross-map edit during apply", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		// 1. Create the container with two named SharedMaps, attach, write,
		//    disconnect, write offline, capture pending local state.
		const goodFactory = new TestFluidObjectFactory(
			[
				["primary", SharedMap.getFactory()],
				["secondary", SharedMap.getFactory()],
			],
			"default",
		);
		const {
			codeDetails,
			loaderProps: goodLoaderProps,
			urlResolver,
		} = createLoader({
			deltaConnectionServer,
			defaultDataStoreFactory: goodFactory,
		});

		const container = asLegacyAlpha(
			await createDetachedContainer({ codeDetails, ...goodLoaderProps }),
		);

		const initialObject = (await container.getEntryPoint()) as ITestFluidObject;
		const primary = await initialObject.getSharedObject<ISharedMap>("primary");
		primary.set("pre-attach", "value");

		await container.attach(urlResolver.createCreateNewRequest("submit-during-apply"));
		primary.set("attached", "value");

		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "container should have a URL after attach");

		container.disconnect();
		primary.set("offline", "value");

		const pendingLocalState = await container.getPendingLocalState();
		container.close();

		// 2. Build a separate loader that, on existing=true loads, wires up a
		//    valueChanged listener on `primary` that performs a cascading set
		//    on `secondary`. Share the resolver and driver so the URL produced
		//    above resolves on the new loader.
		const { loaderProps: reactingLoaderProps } = createLoader({
			deltaConnectionServer,
			defaultDataStoreFactory: new ReactingMapFactory(goodFactory),
		});

		// 3. The stashed `offline` op fires `valueChanged` on `primary` during
		//    apply; the listener's `secondary.set` reaches the runtime's
		//    submit guard (a different channel from the one in applyStashedOp,
		//    so the channel-level stashedOpMd capture doesn't swallow it), and
		//    the load rejects.
		await assert.rejects(
			loadExistingContainer({
				...reactingLoaderProps,
				request: { url },
				pendingLocalState,
			}),
			(error: Error & { message?: string }) =>
				error.message?.includes("Local op submitted during stashed-op apply window") === true,
		);
	});
});
