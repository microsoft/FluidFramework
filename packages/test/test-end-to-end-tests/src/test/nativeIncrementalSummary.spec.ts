/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import { SummaryType, type SummaryObject } from "@fluidframework/driver-definitions";
import type {
	FluidDataStoreContextInternal,
	IFluidDataStoreFactory,
	IFluidDataStoreFactoryInternal,
	IFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions/internal";
import { createSummarizerCore, summarizeNow } from "@fluidframework/test-utils/internal";
import type { ITree } from "@fluidframework/tree/alpha";

describeCompat("Native incremental summaries", "NoCompat", (getProvider, apis) => {
	const {
		SchemaFactoryAlpha,
		TreeViewConfigurationAlpha,
		incrementalSummaryHint,
		configuredSharedTree,
		incrementalEncodingPolicyForAllowedTypes,
		ForestTypeOptimized,
		TreeCompressionStrategy,
		FluidClientVersion,
	} = apis.dataRuntime.packages.tree;
	const { LeafChannelRuntime } = apis.dataRuntime.packages.datastore;
	const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;
	const sf = new SchemaFactoryAlpha("native-incremental");
	class Root extends sf.object("Root", {
		version: sf.number,
		data: sf.types([sf.map(sf.string)], { custom: { [incrementalSummaryHint]: true } }),
	}) {}
	const config = new TreeViewConfigurationAlpha({ schema: Root });
	const treeKind = configuredSharedTree({
		forest: ForestTypeOptimized,
		treeEncodeType: TreeCompressionStrategy.CompressedIncremental,
		minVersionForCollab: FluidClientVersion.v2_74,
		shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(config),
	});
	const treeFactory = treeKind.getFactory();
	const leaf: IFluidDataStoreFactoryInternal = {
		type: treeFactory.type,
		isLeafChannel: true,
		get IFluidDataStoreFactory() {
			return this;
		},
		async instantiateDataStore(context, existing) {
			return LeafChannelRuntime.load(context, existing, treeFactory);
		},
	};
	function composite(
		child: IFluidDataStoreFactory,
		depth: number,
	): IFluidDataStoreFactory & { IFluidDataStoreRegistry: IFluidDataStoreRegistry } {
		const registry: IFluidDataStoreRegistry = {
			get IFluidDataStoreRegistry() {
				return this;
			},
			async get(type) {
				return type === child.type ? child : undefined;
			},
		};
		return {
			type: `collection-${depth}`,
			get IFluidDataStoreFactory() {
				return this;
			},
			get IFluidDataStoreRegistry() {
				return registry;
			},
			async instantiateDataStore(context, existing) {
				const native = context as FluidDataStoreContextInternal;
				assert(native.createChannelCollection !== undefined);
				return native.createChannelCollection(async (collection) => {
					if (!existing) {
						const root = await collection.createDataStore(child, "root");
						collection.bind(root.entryPoint);
					}
					return (await collection.getDataStoreEntryPoint("root")).get();
				});
			},
		} satisfies IFluidDataStoreFactory & { IFluidDataStoreRegistry: IFluidDataStoreRegistry };
	}

	for (const depth of [0, 1, 2]) {
		it(`reuses forest chunks and reloads valid paths with ${depth} containing stores`, async () => {
			const provider = getProvider({ syncSummarizer: true });
			let factory: IFluidDataStoreFactory = leaf;
			for (let i = 1; i <= depth; i++) factory = composite(factory, i);
			const makeRuntimeFactory = (
				isSummarizer: boolean,
			): InstanceType<typeof ContainerRuntimeFactoryWithDefaultDataStore> =>
				new ContainerRuntimeFactoryWithDefaultDataStore({
					defaultFactory: factory,
					registryEntries: [[factory.type, factory]],
					oldestSupportedClient: "3.12.0",
					runtimeOptions: {
						enableRuntimeIdCompressor: "on",
						summaryOptions: {
							summaryConfigOverrides: {
								state: isSummarizer ? "disableHeuristics" : "disabled",
								initialSummarizerDelayMs: 0,
								maxAckWaitTime: 20000,
								maxOpsSinceLastSummary: 7000,
							},
						},
					},
				});
			const runtimeFactory = makeRuntimeFactory(false);
			const container = await provider.createContainer(runtimeFactory);
			const tree = (await container.getEntryPoint()) as ITree;
			const view = tree.viewWith(config);
			view.initialize(new Root({ version: 0, data: { unchanged: "retained" } }));
			await provider.ensureSynchronized();
			const loader = provider.createLoader([
				[provider.defaultCodeDetails, makeRuntimeFactory(true)],
			]);
			const { summarizer } = await createSummarizerCore(container, loader);
			await provider.ensureSynchronized();
			await summarizeNow(summarizer);
			// Establish incremental chunks, then verify successive summaries reuse them.
			for (let version = 1; version <= 3; version++) {
				view.root.version = version;
				await provider.ensureSynchronized();
				const { summaryTree, summaryVersion } = await summarizeNow(summarizer);
				if (version >= 2) {
					const handles: string[] = [];
					function collect(node: SummaryObject): void {
						if (node.type === SummaryType.Tree) {
							for (const child of Object.values(node.tree)) collect(child);
						} else if (node.type === SummaryType.Handle && node.handle.includes("Forest")) {
							handles.push(node.handle);
						}
					}
					collect(summaryTree);
					assert(handles.length > 0, "Unchanged forest chunks must be summary handles");
				}
				const remote = await provider.loadContainer(runtimeFactory, undefined, {
					[LoaderHeader.version]: summaryVersion,
				});
				const remoteTree = (await remote.getEntryPoint()) as ITree;
				const remoteView = remoteTree.viewWith(config);
				assert.equal(remoteView.root.version, version);
				assert.equal(remoteView.root.data.get("unchanged"), "retained");
				remoteView.dispose();
				remote.close();
			}
		});
	}
});
