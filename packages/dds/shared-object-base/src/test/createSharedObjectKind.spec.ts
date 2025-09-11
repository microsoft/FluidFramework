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
	IChannelStorageService,
	IFluidDataStoreRuntime,
	IFluidDataStoreRuntimeInternalConfig,
} from "@fluidframework/datastore-definitions/internal";
import type {
	IExperimentalIncrementalSummaryContext,
	IRuntimeMessageCollection,
	ISummaryTreeWithStats,
	ITelemetryContext,
	MinimumVersionForCollab,
} from "@fluidframework/runtime-definitions/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import type { IFluidSerializer } from "../serializer.js";
import { createSharedObjectKind } from "../sharedObject.js";
import {
	makeSharedObjectKind,
	type FactoryOut,
	type KernelArgs,
	type SharedKernel,
	type SharedKernelFactory,
	type SharedObjectOptions,
} from "../sharedObjectKernel.js";

interface IFoo {
	foo: string;
	minVersionForCollab: MinimumVersionForCollab | undefined;
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
			minVersionForCollab: (runtime as IFluidDataStoreRuntimeInternalConfig)
				.minVersionForCollab,
			// Note: other IChannel methods aren't relevant
		} as IFoo & IChannel;
	}
}

describe("createSharedObjectKind's return type", () => {
	const SharedFoo = createSharedObjectKind<IFoo>(SharedFooFactory);

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

/**
 * The options used to construct a `FooKernelFactory`.
 */
interface FooOptionsInternal {
	readonly minVersionForCollab: MinimumVersionForCollab;
}

/**
 * A minimal implementation of a `KernelView` based on `SharedTreeKernelView` in the \@fluidframework/tree package.
 */
interface FooKernelView extends IFoo {
	readonly kernel: FooKernel;
	readonly minVersionForCollab: MinimumVersionForCollab | undefined;
	readonly foo: string;
}

/**
 * A minimal implementation of a `SharedKernel` that builds a view containing the `minVersionForCollab` it was
 * constructed with. Does not provide any method implementations beyond the constructor.
 */
class FooKernel implements SharedKernel {
	public readonly view: FooKernelView;

	constructor(minVersionForCollab: MinimumVersionForCollab | undefined) {
		this.view = {
			kernel: this,
			minVersionForCollab,
			foo: "foo",
		};
	}

	summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext: ITelemetryContext | undefined,
		incrementalSummaryContext: IExperimentalIncrementalSummaryContext | undefined,
		fullTree?: boolean,
	): ISummaryTreeWithStats {
		throw new Error("Method not implemented.");
	}
	onDisconnect(): void {
		throw new Error("Method not implemented.");
	}
	reSubmitCore(content: unknown, localOpMetadata: unknown): void {
		throw new Error("Method not implemented.");
	}
	applyStashedOp(content: unknown): void {
		throw new Error("Method not implemented.");
	}
	processMessagesCore(messagesCollection: IRuntimeMessageCollection): void {
		throw new Error("Method not implemented.");
	}
	rollback?(content: unknown, localOpMetadata: unknown): void {
		throw new Error("Method not implemented.");
	}
	didAttach?(): void {
		throw new Error("Method not implemented.");
	}
}

describe("createSharedObjectKind with minVersionForCollab", () => {
	/**
	 * A simple KernelFactory that creates a `FooKernel` with the `minVersionForCollab` from its constructor arguments.
	 * @param options - The options for the factory.
	 * @returns A `SharedKernelFactory` that creates `FooKernelView` instances.
	 */
	function fooKernelFactory(options: FooOptionsInternal): SharedKernelFactory<FooKernelView> {
		function fooFromKernelArgs(args: KernelArgs): FooKernel {
			return new FooKernel(args.minVersionForCollab);
		}

		return {
			create(args: KernelArgs): FactoryOut<FooKernelView> {
				const kernel = fooFromKernelArgs(args);
				return { kernel, view: kernel.view };
			},
			async loadCore(
				args: KernelArgs,
				storage: IChannelStorageService,
			): Promise<FactoryOut<FooKernelView>> {
				const kernel = fooFromKernelArgs(args);
				// There is no differentiation between load and create for the purposes of this test.
				return { kernel, view: kernel.view };
			},
		};
	}

	it("SharedObject can be constructed with a minVersionForCollab from the runtime", () => {
		const minVersionForCollab = "1.2.3";
		const type = "Foo";

		const attributes: IChannelAttributes = {
			type,
			snapshotFormatVersion: "0.1",
			packageVersion: "2.0.0",
		};

		const options: FooOptionsInternal = {
			minVersionForCollab,
		};

		const sharedObjectOptions: SharedObjectOptions<IFoo> = {
			type: "",
			attributes,
			telemetryContextPrefix: "foo_",
			factory: fooKernelFactory(options),
		};

		const SharedFoo = makeSharedObjectKind(sharedObjectOptions);
		const runtime = new MockFluidDataStoreRuntime({
			registry: [SharedFoo.getFactory()],
			minVersionForCollab,
		});
		const foo = SharedFoo.create(runtime, "test-id");

		assert.strictEqual(foo.minVersionForCollab, "1.2.3");
	});
});
