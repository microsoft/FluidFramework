/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import type {
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { createSharedObjectKind } from "../sharedObject.js";

interface IFoo {
	foo: string;
}
class SharedFooFactory implements IChannelFactory<IFoo> {
	public static readonly Type: string = "SharedFoo";
	public readonly type: string = SharedFooFactory.Type;
	public readonly attributes: IChannelAttributes = {
		type: SharedFooFactory.Type,
		snapshotFormatVersion: "0.1",
	};
	async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<IFoo & IChannel> {
		throw new Error("Method not implemented.");
	}
	create(runtime: IFluidDataStoreRuntime, id: string): IFoo & IChannel {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return {
			foo: "bar",
			attributes: this.attributes,
			id,
			// Note: other IChannel methods aren't relevant
		} as IFoo & IChannel;
	}
}

const SharedFoo = createSharedObjectKind<IFoo>(SharedFooFactory);

describe("createSharedObjectKind's return type", () => {
	it("delegates to runtime.createChannel on creation", () => {
		const createChannelCalls: [id: string | undefined, type: string][] = [];
		const runtime = new MockFluidDataStoreRuntime();
		runtime.createChannel = (id: string | undefined, type: string) => {
			createChannelCalls.push([id, type]);
			return undefined as unknown as IChannel;
		};
		SharedFoo.create(runtime);
		assert.deepEqual(createChannelCalls, [[undefined, SharedFooFactory.Type]]);
		createChannelCalls.length = 0;
		SharedFoo.create(runtime, "test-id");
		assert.deepEqual(createChannelCalls, [["test-id", SharedFooFactory.Type]]);
	});

	describe(".is", () => {
		it("returns true for objects created by the factory", () => {
			const factory = SharedFoo.getFactory();
			const foo = factory.create(new MockFluidDataStoreRuntime(), "test-id");
			assert(SharedFoo.is(foo));
		});
		describe("returns false for", () => {
			const cases: [name: string, obj: unknown][] = [
				["object without attributres", {}],
				["object with wrong type", { attributes: { type: "NotSharedFoo" } }],
			];
			for (const [name, obj] of cases) {
				it(name, () => {
					assert(!SharedFoo.is(obj as IFluidLoadable));
				});
			}
		});
	});
});
