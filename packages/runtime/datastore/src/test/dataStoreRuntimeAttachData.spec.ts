/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import type {
	IChannel,
	IChannelAttributes,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import type {
	IContainerRuntimeBase,
	IFluidDataStoreAttachData,
	IFluidDataStoreChannelInternal,
	IGarbageCollectionData,
	ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions/internal";
import { MockFluidDataStoreContext } from "@fluidframework/test-runtime-utils/internal";

import { FluidDataStoreRuntime, type ISharedObjectRegistry } from "../dataStoreRuntime.js";
import { FluidObjectHandle } from "../fluidHandle.js";

const channelType = "TestChannelType";

/**
 * A minimal {@link IChannel} implementation whose attach summary and GC data generation can be
 * configured to synchronously create and bind additional channels, the way a real DDS can when its
 * content creates other DDSes while being summarized or GC'd.
 */
class TestChannel implements IChannel {
	public readonly attributes: IChannelAttributes = {
		type: channelType,
		snapshotFormatVersion: "0.1",
	};
	public readonly handle: FluidObjectHandle;

	/**
	 * Routes reported by {@link TestChannel.getGCData}.
	 */
	public readonly outboundRoutes: string[] = [];

	public summarizeCount = 0;
	public getGCDataCount = 0;

	public constructor(
		public readonly id: string,
		private readonly runtime: FluidDataStoreRuntime,
		private readonly onGetAttachSummary?: (channel: TestChannel) => void,
		private readonly onGetGCData?: (channel: TestChannel) => void,
	) {
		this.handle = new FluidObjectHandle(
			this as unknown as IFluidLoadable,
			id,
			runtime.IFluidHandleContext,
		);
	}

	public get IFluidLoadable(): IFluidLoadable {
		return this as unknown as IFluidLoadable;
	}

	public getAttachSummary(): ISummaryTreeWithStats {
		this.summarizeCount++;
		this.onGetAttachSummary?.(this);
		return {
			stats: {
				treeNodeCount: 1,
				blobNodeCount: 0,
				handleNodeCount: 0,
				totalBlobSize: 0,
				unreferencedBlobSize: 0,
			},
			summary: { type: SummaryType.Tree, tree: {} },
		};
	}

	public async summarize(): Promise<ISummaryTreeWithStats> {
		return this.getAttachSummary();
	}

	public isAttached(): boolean {
		return this.runtime.isAttached;
	}

	public connect(services: IChannelServices): void {}

	public getGCData(fullGC?: boolean): IGarbageCollectionData {
		this.getGCDataCount++;
		this.onGetGCData?.(this);
		return { gcNodes: { "/": [...this.outboundRoutes] } };
	}
}

describe("FluidDataStoreRuntime attach data", () => {
	let dataStoreContext: MockFluidDataStoreContext;
	let runtime: FluidDataStoreRuntime;
	/**
	 * Channels created via the shared object registry, by id. Populated as channels are created so that
	 * tests can inspect how many times each was summarized / GC'd.
	 */
	let channels: Map<string, TestChannel>;
	/**
	 * Callbacks to run when the channel with the given id generates its attach summary / GC data.
	 */
	let summaryHooks: Map<string, (channel: TestChannel) => void>;
	let gcHooks: Map<string, (channel: TestChannel) => void>;

	/**
	 * Creates a channel and binds it, the same way a DDS does via `bindToContext`.
	 */
	function createAndBindChannel(id: string): TestChannel {
		const channel = runtime.createChannel(id, channelType) as unknown as TestChannel;
		runtime.bindChannel(channel as unknown as IChannel);
		return channel;
	}

	beforeEach(() => {
		channels = new Map();
		summaryHooks = new Map();
		gcHooks = new Map();

		dataStoreContext = new MockFluidDataStoreContext();
		dataStoreContext.containerRuntime = {} as unknown as IContainerRuntimeBase;
		dataStoreContext.packagePath = [];
		// The mock throws by default; the runtime calls this when it becomes locally visible.
		dataStoreContext.makeLocallyVisible = (): void => {};

		const sharedObjectRegistry: ISharedObjectRegistry = {
			get(type: string) {
				return {
					type,
					attributes: { type, snapshotFormatVersion: "0.1" },
					create: (channelRuntime: IFluidDataStoreRuntime, id: string): IChannel => {
						const channel = new TestChannel(
							id,
							channelRuntime as FluidDataStoreRuntime,
							(c) => summaryHooks.get(c.id)?.(c),
							(c) => gcHooks.get(c.id)?.(c),
						);
						channels.set(id, channel);
						return channel as unknown as IChannel;
					},
					load: async (): Promise<IChannel> => {
						throw new Error("Not implemented");
					},
				};
			},
		};

		runtime = new FluidDataStoreRuntime(
			dataStoreContext,
			sharedObjectRegistry,
			/* existing */ false,
			async () => runtime,
		);
	});

	/**
	 * Returns the ids of the channels present in the given attach summary tree.
	 */
	function summarizedChannelIds(attachSummary: ISummaryTreeWithStats): string[] {
		assert(attachSummary.summary.type === SummaryType.Tree, "Attach summary should be a tree");
		return Object.keys(attachSummary.summary.tree).sort();
	}

	/**
	 * Returns the ids of the channels present in the given attach GC data, excluding the root node.
	 */
	function gcChannelIds(attachGCData: IGarbageCollectionData): string[] {
		return Object.keys(attachGCData.gcNodes)
			.filter((nodeId) => nodeId !== "/")
			.map((nodeId) => nodeId.replace(/^\//, ""))
			.sort();
	}

	/**
	 * Calls the combined attach capture through the internal channel contract that the container runtime
	 * uses, which also verifies that {@link FluidDataStoreRuntime} satisfies that contract.
	 */
	function getAttachData(): IFluidDataStoreAttachData {
		const channel = runtime as unknown as Required<
			Pick<IFluidDataStoreChannelInternal, "getAttachData">
		>;
		return channel.getAttachData();
	}

	it("provides the internal combined attach capture contract", () => {
		assert.strictEqual(
			typeof (runtime as unknown as IFluidDataStoreChannelInternal).getAttachData,
			"function",
			"getAttachData should be implemented",
		);
	});

	it("captures channels bound while another channel's GC data is generated", () => {
		const channelA = createAndBindChannel("A");
		runtime.makeVisibleAndAttachGraph();

		// While A's GC data is generated, it creates and binds B. This mirrors a DDS that creates
		// another DDS as a side effect of walking its own content for GC.
		gcHooks.set("A", () => {
			const channelB = createAndBindChannel("B");
			channelA.outboundRoutes.push(channelB.handle.absolutePath);
		});

		const { attachSummary, attachGCData } = getAttachData();

		assert.deepStrictEqual(
			summarizedChannelIds(attachSummary),
			["A", "B"],
			"B was bound during A's GC and must be in the attach summary",
		);
		assert.deepStrictEqual(
			gcChannelIds(attachGCData),
			["A", "B"],
			"Both channels must contribute GC data",
		);
	});

	it("closes over channels bound while a newly captured channel is summarized", () => {
		const channelA = createAndBindChannel("A");
		runtime.makeVisibleAndAttachGraph();

		// A's GC binds B, and B's summary in turn binds C.
		gcHooks.set("A", () => {
			const channelB = createAndBindChannel("B");
			channelA.outboundRoutes.push(channelB.handle.absolutePath);
		});
		summaryHooks.set("B", () => {
			createAndBindChannel("C");
		});

		const { attachSummary, attachGCData } = getAttachData();

		assert.deepStrictEqual(
			summarizedChannelIds(attachSummary),
			["A", "B", "C"],
			"The capture must close over transitively bound channels",
		);
		assert.deepStrictEqual(
			gcChannelIds(attachGCData),
			["A", "B", "C"],
			"The GC data must cover the same channels as the summary",
		);
	});

	it("captures each channel's summary and GC data at most once", () => {
		const channelA = createAndBindChannel("A");
		runtime.makeVisibleAndAttachGraph();

		gcHooks.set("A", () => {
			const channelB = createAndBindChannel("B");
			channelA.outboundRoutes.push(channelB.handle.absolutePath);
		});

		getAttachData();

		for (const id of ["A", "B"]) {
			const channel = channels.get(id);
			assert(channel !== undefined, `Channel ${id} should have been created`);
			assert.strictEqual(channel.summarizeCount, 1, `${id} should be summarized once`);
			assert.strictEqual(channel.getGCDataCount, 1, `${id} should generate GC data once`);
		}
	});

	it("does not bind unbound channels and matches the individual capture APIs", () => {
		const channelA = createAndBindChannel("A");
		// An unbound channel must not show up in the attach data.
		runtime.createChannel("unbound", channelType);
		runtime.makeVisibleAndAttachGraph();
		channelA.outboundRoutes.push("/some/route");

		const { attachSummary, attachGCData } = getAttachData();

		assert.deepStrictEqual(
			summarizedChannelIds(attachSummary),
			["A"],
			"Only bound channels should be in the attach summary",
		);
		assert.deepStrictEqual(
			attachGCData,
			runtime.getAttachGCData(),
			"Combined capture should match the standalone GC data capture",
		);
		assert.deepStrictEqual(
			summarizedChannelIds(attachSummary),
			summarizedChannelIds(runtime.getAttachSummary()),
			"Combined capture should match the standalone summary capture",
		);
	});
});
