/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, getContainerRuntimeApi } from "@fluid-private/test-version-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions/internal";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import {
	ISequencedDocumentMessage,
	SummaryObject,
	SummaryType,
} from "@fluidframework/driver-definitions";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import {
	IExperimentalIncrementalSummaryContext,
	ISummaryTreeWithStats,
	ITelemetryContext,
	channelsTreeName,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import {
	IFluidSerializer,
	SharedObject,
	createSharedObjectKind,
} from "@fluidframework/shared-object-base/internal";
import {
	ITestFluidObject,
	ITestObjectProvider,
	TestFluidObjectFactory,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils/internal";

import { pkgVersion } from "../packageVersion.js";

// Test DDS factory for the blob dds
class TestBlobDDSFactory implements IChannelFactory {
	public static readonly Type = "incrementalBlobDDS";

	public static readonly Attributes: IChannelAttributes = {
		type: TestBlobDDSFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type(): string {
		return TestBlobDDSFactory.Type;
	}

	public get attributes(): IChannelAttributes {
		return TestBlobDDSFactory.Attributes;
	}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<TestIncrementalSummaryBlobDDS> {
		const sharedObject = new TestIncrementalSummaryBlobDDS(
			id,
			runtime,
			attributes,
			"TestBlobDDS",
		);
		await sharedObject.load(services);
		return sharedObject;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public create(document: IFluidDataStoreRuntime, id: string): TestIncrementalSummaryBlobDDS {
		return new TestIncrementalSummaryBlobDDS(id, document, this.attributes, "TestBlobDDS");
	}
}

// Note: other DDSes have called this variable snapshotFileName
const headerBlobName = "header";
interface ISnapshot {
	blobs: string[];
}

interface IBlob {
	value: string;
	seqNumber: number;
}

interface ICreateBlobOp {
	type: "blobStorage";
	value: string;
}

// Creates blobs that can be incrementally summarized
class TestIncrementalSummaryBlobDDS extends SharedObject {
	static getFactory(): IChannelFactory {
		return new TestBlobDDSFactory();
	}
	private readonly blobMap: Map<string, IBlob> = new Map();

	protected summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext | undefined,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined,
	): ISummaryTreeWithStats {
		const builder = new SummaryTreeBuilder();

		/**
		 * This is the key part of the code that incrementally summarizes. If the blob has not changed since the last
		 * summary successfully acknowledged by the server, then we submit a summary blob handle instead of the blob
		 * itself. Since every op only changes a blob
		 */
		for (const [blobName, blobContent] of this.blobMap.entries()) {
			if (
				incrementalSummaryContext &&
				blobContent.seqNumber <= incrementalSummaryContext.latestSummarySequenceNumber
			) {
				// This is an example assert that detects that the system behaving incorrectly.
				assert(
					blobContent.seqNumber <= incrementalSummaryContext.summarySequenceNumber,
					"Ops processed beyond the summarySequenceNumber!",
				);
				builder.addHandle(
					blobName,
					SummaryType.Blob,
					`${incrementalSummaryContext.summaryPath}/${blobName}`,
				);
			} else {
				builder.addBlob(blobName, JSON.stringify(blobContent));
			}
		}

		const content: ISnapshot = {
			blobs: Array.from(this.blobMap.keys()),
		};

		builder.addBlob(headerBlobName, JSON.stringify(content));
		return builder.getSummaryTree();
	}
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const content = await readAndParse<ISnapshot>(storage, headerBlobName);
		for (const blob of content.blobs) {
			const blobContent = await readAndParse<IBlob>(storage, blob);
			this.blobMap.set(blob, blobContent);
		}
	}
	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		if (message.type === MessageType.Operation) {
			const op = message.contents as ICreateBlobOp;
			switch (op.type) {
				case "blobStorage": {
					const blob: IBlob = {
						value: op.value,
						seqNumber: message.sequenceNumber,
					};
					const blobName = `${this.blobMap.size}`;
					this.blobMap.set(blobName, blob);
					break;
				}
				default:
					throw new Error("Unknown operation");
			}
		}
	}

	public createBlobOp(content: string) {
		const op: ICreateBlobOp = {
			type: "blobStorage",
			value: content,
		};
		this.submitLocalMessage(op);
	}

	protected onDisconnect() {}
	protected applyStashedOp(content: any): unknown {
		throw new Error("Method not implemented.");
	}
}

// Test DDS factory for the tree dds
class TestTreeDDSFactory implements IChannelFactory<TestIncrementalSummaryTreeDDS> {
	public static readonly Type = "incrementalTreeDDS";

	public static readonly Attributes: IChannelAttributes = {
		type: TestTreeDDSFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type(): string {
		return TestTreeDDSFactory.Type;
	}

	public get attributes(): IChannelAttributes {
		return TestTreeDDSFactory.Attributes;
	}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<TestIncrementalSummaryTreeDDS> {
		const sharedObject = new TestIncrementalSummaryTreeDDSClass(
			id,
			runtime,
			attributes,
			"TestTreeDDS",
		);
		await sharedObject.load(services);
		return sharedObject;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public create(document: IFluidDataStoreRuntime, id: string): TestIncrementalSummaryTreeDDS {
		return new TestIncrementalSummaryTreeDDSClass(id, document, this.attributes, "TestTreeDDS");
	}
}

interface ISerializableTreeNode {
	children: string[];
	name: string;
	seqNumber: number;
}

interface ITreeNode {
	children: ITreeNode[];
	name: string;
	seqNumber: number;
}

interface ICreateTreeNodeOp {
	parentPath: string[];
	name: string;
	type: "treeOp";
}

const TestIncrementalSummaryTreeDDS = createSharedObjectKind(TestTreeDDSFactory);
export type TestIncrementalSummaryTreeDDS = TestIncrementalSummaryTreeDDSClass;

// Creates trees that can be incrementally summarized
// Each op creates a new child node for any node in the tree.
// The data of the tree is stored in the node's header blob
// Any node and its subsequent children that do not change are summarized as a summary handle
// This tree is written in a simple recursive structure.
// The test below should indicate how the DDS can be used.
class TestIncrementalSummaryTreeDDSClass extends SharedObject {
	public readonly rootNodeName = "rootNode";
	private readonly root: ITreeNode = {
		children: [],
		name: this.rootNodeName,
		seqNumber: 0,
	};

	protected summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext | undefined,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined,
	): ISummaryTreeWithStats {
		// Technically, we can just return what summarizeNode returns.
		// It turns out, the logic for the root node gets a little challenging, and it's easier to simply make the tree
		// on level deeper.
		const builder = new SummaryTreeBuilder();

		// Summarize the root node and store it as a summary tree
		const tree = this.summarizeNode(
			this.root,
			incrementalSummaryContext,
			incrementalSummaryContext
				? `${incrementalSummaryContext.summaryPath}/${this.root.name}`
				: undefined,
		);
		builder.addWithStats(this.root.name, tree);

		return builder.getSummaryTree();
	}

	// Creates a summary tree for a node
	private summarizeNode(
		node: ITreeNode,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined,
		path?: string,
	): ISummaryTreeWithStats {
		const builder = new SummaryTreeBuilder();

		// This is the nodeData of the tree that we need to store in the blob
		const nodeData: ISerializableTreeNode = {
			children: [],
			name: node.name,
			seqNumber: node.seqNumber,
		};

		// Go through each child and either generate a handle or tree node
		for (const childNode of node.children) {
			// Populate the nodeData
			nodeData.children.push(childNode.name);

			// Generate the child path if given a path.
			// The only time path === undefined is when incremental summary context is undefined
			const childPath = path ? `${path}/${childNode.name}` : undefined;

			// Determine if the child has changed, generate a handle if that's the case
			if (
				incrementalSummaryContext !== undefined &&
				childNode.seqNumber <= incrementalSummaryContext.latestSummarySequenceNumber
			) {
				// Generate a handle
				assert(childPath !== undefined, "Path should be defined!");
				builder.addHandle(childNode.name, SummaryType.Tree, childPath);
			} else {
				// Generate a tree
				builder.addWithStats(
					childNode.name,
					this.summarizeNode(childNode, incrementalSummaryContext, childPath),
				);
			}
		}

		// Note: you can also make this part of the tree incremental, check the BlobDDS for that
		// Unfortunately for DDSes, the snapshot tree is not given to the DDS, the IChannelStorageService should be
		// updated to return the DDS tree itself
		builder.addBlob(headerBlobName, JSON.stringify(nodeData));

		return builder.getSummaryTree();
	}

	// Loads the root node from storage
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const loadedRoot = await this.loadTreeNode(storage, this.rootNodeName);
		this.root.children = loadedRoot.children;
		this.root.name = loadedRoot.name;
		this.root.seqNumber = loadedRoot.seqNumber;
	}

	private async loadTreeNode(storage: IChannelStorageService, path: string): Promise<ITreeNode> {
		// Based on the storage API, we have to retrieve the data from a blob instead of using the snapshot tree itself
		const nodeData = await readAndParse<ISerializableTreeNode>(
			storage,
			`${path}/${headerBlobName}`,
		);
		const node: ITreeNode = {
			children: [],
			name: nodeData.name,
			seqNumber: nodeData.seqNumber,
		};
		for (const childTreeName of nodeData.children) {
			const childNode = await this.loadTreeNode(storage, `${path}/${childTreeName}`);
			node.children.push(childNode);
		}
		return node;
	}

	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		if (message.type === MessageType.Operation) {
			const op = message.contents as ICreateTreeNodeOp;
			switch (op.type) {
				case "treeOp": {
					const node: ITreeNode = {
						children: [],
						name: op.name,
						seqNumber: message.sequenceNumber,
					};
					const parent = this.findNodeAndUpdateSeqNumber(
						op.parentPath,
						this.root,
						message.sequenceNumber,
					);

					parent.children.push(node);
					break;
				}
				default:
					throw new Error("Unknown operation");
			}
		}
	}

	// searches the node tree for a given path, updates the seq number of each node
	// returns the found child node.
	// This essentially updates the sequence number of the spine of the tree.
	private findNodeAndUpdateSeqNumber(
		path: string[],
		current: ITreeNode,
		seqNumber: number,
	): ITreeNode {
		const name = path[0];
		assert(name === current.name, "Node name is incorrect!");
		current.seqNumber = seqNumber;
		const newPath = path.slice(1);
		if (newPath.length === 0) {
			return current;
		}
		const child = this.searchForChild(newPath[0], current.children);
		return this.findNodeAndUpdateSeqNumber(newPath, child, seqNumber);
	}

	// searches the node tree for a given path to insure the path can be reached
	private validatePath(path: string[], current: ITreeNode) {
		const name = path[0];
		assert(name === current.name, "Path is incorrect!");
		const newPath = path.slice(1);
		if (newPath.length === 0) {
			return;
		}
		const child = this.searchForChild(newPath[0], current.children);
		this.validatePath(newPath, child);
	}

	// Finds a treeNode in a list of tree nodes with the given name
	private searchForChild(name: string, children: ITreeNode[]): ITreeNode {
		for (const child of children) {
			if (child.name === name) {
				return child;
			}
		}
		throw new Error("child not found!");
	}

	/**
	 * All this does is creates a new node attached to some parent with the path starting from the root node
	 * Note: The name of the node should be unique, it may cause issues if it is not.
	 */
	public createTreeOp(parentPath: string[], name: string) {
		this.validatePath(parentPath, this.root);
		const op: ICreateTreeNodeOp = {
			type: "treeOp",
			parentPath,
			name,
		};
		this.submitLocalMessage(op);
	}

	protected onDisconnect() {}
	protected applyStashedOp(content: any): unknown {
		throw new Error("Method not implemented.");
	}
}

/**
 * Validates that incremental summaries can be performed at the sub DDS level, i.e., a DDS can summarizer its
 * contents incrementally.
 */
describeCompat(
	"Incremental summaries can be generated for DDS content",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;

		let provider: ITestObjectProvider;
		const defaultFactory = new TestFluidObjectFactory([
			[
				TestIncrementalSummaryTreeDDS.getFactory().type,
				TestIncrementalSummaryTreeDDS.getFactory(),
			],
			[
				TestIncrementalSummaryBlobDDS.getFactory().type,
				TestIncrementalSummaryBlobDDS.getFactory(),
			],
		]);
		const runtimeOptions: IContainerRuntimeOptions = {
			summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
		};
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory,
			registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
			runtimeOptions,
		});

		const createContainer = async (): Promise<IContainer> => {
			return provider.createContainer(runtimeFactory);
		};

		async function loadContainer(summaryVersion: string) {
			return provider.loadContainer(runtimeFactory, undefined, {
				[LoaderHeader.version]: summaryVersion,
			});
		}

		async function createSummarizer(container: IContainer, summaryVersion?: string) {
			const createSummarizerResult = await createSummarizerFromFactory(
				provider,
				container,
				defaultFactory,
				summaryVersion,
				getContainerRuntimeApi(pkgVersion).ContainerRuntimeFactoryWithDefaultDataStore,
			);
			return createSummarizerResult.summarizer;
		}

		/**
		 * Validates that the passed summaryObject is a summary handle. Also, the handle id is correct.
		 */
		function validateHandle(
			summaryObject: SummaryObject,
			dataStoreId: string,
			ddsId: string,
			subDDSId: string,
			messagePrefix: string,
		) {
			// The handle id for sub-DDS should be under ".channels/<dataStoreId>/.channels/<ddsId>" as that is where
			// the summary tree for a sub-DDS is.
			const expectedHandleId = `/${channelsTreeName}/${dataStoreId}/${channelsTreeName}/${ddsId}/${subDDSId}`;
			assert.strictEqual(
				summaryObject.type,
				SummaryType.Handle,
				`${messagePrefix} should be a handle`,
			);
			assert.strictEqual(
				summaryObject.handle,
				expectedHandleId,
				`${messagePrefix}'s handle id is incorrect`,
			);
		}

		beforeEach("getTestObjectProvider", async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
		});

		it("can create summary handles for blobs in DDSes that do not change", async () => {
			const container = await createContainer();
			const datastore = (await container.getEntryPoint()) as ITestFluidObject;
			const dds = await datastore.getSharedObject<TestIncrementalSummaryBlobDDS>(
				TestIncrementalSummaryBlobDDS.getFactory().type,
			);
			// Each op leads to the creation of a new blob in the summary.
			// Older blobs never are modified in this case for simplicity sake.
			dds.createBlobOp("test data 1");
			dds.createBlobOp("test data 2");
			dds.createBlobOp("test data 3");

			const summarizer = await createSummarizer(container);
			await provider.ensureSynchronized();
			await summarizeNow(summarizer);

			// This op goes into a different blob. The previous unchanged 3 should be summarized as summary handles.
			dds.createBlobOp("test data 4");

			await provider.ensureSynchronized();
			const { summaryTree } = await summarizeNow(summarizer);

			// Verify the summary tree is generated as we expected it to be.
			assert(
				summaryTree.tree[".channels"].type === SummaryType.Tree,
				"Runtime summary tree not created for blob dds test",
			);
			const dataObjectTree = summaryTree.tree[".channels"].tree[datastore.runtime.id];
			assert(
				dataObjectTree.type === SummaryType.Tree,
				"Data store summary tree not created for blob dds test",
			);
			const dataObjectChannelsTree = dataObjectTree.tree[".channels"];
			assert(
				dataObjectChannelsTree.type === SummaryType.Tree,
				"Data store channels tree not created for blob dds test",
			);
			const ddsTree = dataObjectChannelsTree.tree[dds.id];
			assert(ddsTree.type === SummaryType.Tree, "Blob dds tree not created");
			validateHandle(ddsTree.tree["0"], datastore.context.id, dds.id, "0", "Blob 0");
			validateHandle(ddsTree.tree["1"], datastore.context.id, dds.id, "1", "Blob 1");
			validateHandle(ddsTree.tree["2"], datastore.context.id, dds.id, "2", "Blob 2");
			assert(ddsTree.tree["3"].type === SummaryType.Blob, "Blob 3 should be a blob");
		});

		it("can create summary handles for trees in DDSes that do not change", async () => {
			const container = await createContainer();
			const datastore = (await container.getEntryPoint()) as ITestFluidObject;
			const dds = await datastore.getSharedObject<TestIncrementalSummaryTreeDDS>(
				TestIncrementalSummaryTreeDDS.getFactory().type,
			);
			// Tree starts with a root with name rootNodeName
			// The next ops create this tree
			//   root
			//   / | \
			//  a  b  c
			dds.createTreeOp([dds.rootNodeName], "a");
			dds.createTreeOp([dds.rootNodeName], "b");
			dds.createTreeOp([dds.rootNodeName], "c");

			const summarizer = await createSummarizer(container);
			await provider.ensureSynchronized();
			await summarizeNow(summarizer);

			// This tree gets updated this way
			//   root
			//   / | \
			//  a  b  c
			//     |
			//     f
			// a and c should be handles, and the root -> b -> f should be trees
			dds.createTreeOp([dds.rootNodeName, "b"], "f");

			await provider.ensureSynchronized();
			const { summaryTree, summaryVersion } = await summarizeNow(summarizer);

			// Verify the summary tree is generated as we expected it to be.
			// Handles for "a" and "c", "b" and "f" should be trees
			assert(
				summaryTree.tree[".channels"].type === SummaryType.Tree,
				"Runtime summary1 tree not created for tree dds test",
			);
			const dataObjectTree = summaryTree.tree[".channels"].tree[datastore.runtime.id];
			assert(
				dataObjectTree.type === SummaryType.Tree,
				"Data store summary1 tree not created for tree dds test",
			);
			const dataObjectChannelsTree = dataObjectTree.tree[".channels"];
			assert(
				dataObjectChannelsTree.type === SummaryType.Tree,
				"Data store summary1 channels tree not created for tree dds test",
			);
			const ddsTree = dataObjectChannelsTree.tree[dds.id];
			assert(ddsTree.type === SummaryType.Tree, "Summary1 tree not created for tree dds");
			const rootNode = ddsTree.tree[dds.rootNodeName];
			assert(
				rootNode.type === SummaryType.Tree,
				"Summary1 - 'rootNode' should be a summary tree",
			);
			validateHandle(
				rootNode.tree.a,
				datastore.context.id,
				dds.id,
				`${dds.rootNodeName}/a`,
				"Summary1 - 'a'",
			);
			assert(
				rootNode.tree.b.type === SummaryType.Tree,
				"Summary1 - 'b' should be a summary tree",
			);
			assert(
				rootNode.tree.b.tree.f.type === SummaryType.Tree,
				"Summary1 - 'f' should be a summary tree",
			);
			validateHandle(
				rootNode.tree.c,
				datastore.context.id,
				dds.id,
				`${dds.rootNodeName}/c`,
				"Summary1 - 'c'",
			);

			// Test that we can load from multiple containers
			const container2 = await loadContainer(summaryVersion);
			const datastore2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const dds2 = await datastore2.getSharedObject<TestIncrementalSummaryTreeDDS>(
				TestIncrementalSummaryTreeDDS.getFactory().type,
			);

			// This tree gets updated this way
			//   root
			//   / | \
			//  a  b  c
			//     |   \
			//     f    g
			// a and c should be handles, and the root -> b -> f should be trees
			dds2.createTreeOp([dds.rootNodeName, "c"], "g");

			await provider.ensureSynchronized();
			const { summaryTree: summaryTree2 } = await summarizeNow(summarizer);

			// Verify the summary tree is generated as we expected it to be.
			// Handles for "a" and "b", "c" and "g" should be trees, "f" is under "b" and thus shouldn't be in the summary.
			assert(
				summaryTree2.tree[".channels"].type === SummaryType.Tree,
				"Runtime summary2 tree not created for tree dds test",
			);
			const dataObjectTree2 = summaryTree2.tree[".channels"].tree[datastore2.runtime.id];
			assert(
				dataObjectTree2.type === SummaryType.Tree,
				"Data store summary2 tree not created for tree dds test",
			);
			const dataObjectChannelsTree2 = dataObjectTree2.tree[".channels"];
			assert(
				dataObjectChannelsTree2.type === SummaryType.Tree,
				"Data store summary2 channels tree not created for tree dds test",
			);
			const ddsTree2 = dataObjectChannelsTree2.tree[dds2.id];
			assert(ddsTree2.type === SummaryType.Tree, "Summary2 tree not created for tree dds");
			const rootNode2 = ddsTree2.tree[dds.rootNodeName];
			assert(
				rootNode2.type === SummaryType.Tree,
				"Summary2 - 'rootNode' should be a summary tree",
			);
			validateHandle(
				rootNode2.tree.a,
				datastore.context.id,
				dds.id,
				`${dds.rootNodeName}/a`,
				"Summary2 - 'a'",
			);
			validateHandle(
				rootNode2.tree.b,
				datastore.context.id,
				dds.id,
				`${dds.rootNodeName}/b`,
				"Summary1 - 'b'",
			);
			assert(
				rootNode2.tree.c.type === SummaryType.Tree,
				"Summary2 - 'c' should be a summary tree",
			);
			assert(
				rootNode2.tree.c.tree.g.type === SummaryType.Tree,
				"Summary2 - 'g' should be a summary tree",
			);
		});
	},
);
