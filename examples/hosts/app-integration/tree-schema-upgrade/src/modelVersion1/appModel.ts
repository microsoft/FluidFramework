/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IMigrationTool } from "@fluid-example/example-utils";
import {
	BuildNode,
	Change,
	NodeId,
	SharedTree,
	StableNodeId,
	StablePlace,
	TraitLabel,
	TreeViewNode,
} from "@fluid-experimental/tree";
import { brand, JsonableTree } from "@fluid-internal/tree";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { AttachState, IContainer } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";

import { readVersion } from "../dataTransform";
import type {
	IInventoryListAppModel,
	IInventoryListAppModelEvents,
	IInventoryList,
} from "../modelInterfaces";

// This type represents a stronger expectation than just any string - it needs to be in the right format.
export type InventoryListAppModelExportFormat1 = string;

/**
 * The InventoryListAppModel serves the purpose of wrapping this particular Container in a friendlier interface,
 * with stronger typing and accessory functionality.  It should have the same layering restrictions as we want for
 * the Container (e.g. no direct access to the Loader).  It does not have a goal of being general-purpose like
 * Container does -- instead it is specially designed for the specific container code.
 */
export class InventoryListAppModel
	extends TypedEventEmitter<IInventoryListAppModelEvents>
	implements IInventoryListAppModel
{
	// To be used by the consumer of the model to pair with an appropriate view.
	public readonly version = "one";

	public constructor(
		public readonly inventoryList: IInventoryList,
		public readonly migrationTool: IMigrationTool,
		private readonly container: IContainer,
	) {
		super();
		this.container.on("connected", () => {
			this.emit("connected");
		});
	}

	public readonly supportsDataFormat = (
		initialData: unknown,
	): initialData is InventoryListAppModelExportFormat1 => {
		return typeof initialData === "string" && readVersion(initialData) === "one";
	};

	// Ideally, prevent this from being called after the container has been modified at all -- i.e. only support
	// importing data into a completely untouched InventoryListAppModel.
	public readonly importData = async (initialData: unknown): Promise<void> => {
		if (this.container.attachState !== AttachState.Detached) {
			throw new Error("Cannot set initial data after attach");
		}
		if (!this.supportsDataFormat(initialData)) {
			throw new Error("Data format not supported");
		}
		const version = readVersion(initialData);
		if (version !== "one") {
			throw new Error(`Expected to parse version one, got version ${version}`);
		}
		const dataWithRemovedVersion = initialData.split("\n");
		dataWithRemovedVersion.shift();
		const treeData = dataWithRemovedVersion[0];
		const jsonableTree: JsonableTree = JSON.parse(treeData);
		constructTreeFromTreeData(
			this.inventoryList.tree as SharedTree,
			this.inventoryList.nodeIds as NodeId[],
			jsonableTree,
			undefined,
			true,
		);
	};

	public readonly exportData = async (): Promise<InventoryListAppModelExportFormat1> => {
		const tree = this.inventoryList.tree as SharedTree;
		const stringifiedTree = transformTreeToJsonableString(tree);
		return `version:one\n${stringifiedTree}`;
	};

	public connected() {
		return this.container.connectionState === ConnectionState.Connected;
	}

	public close() {
		this.container.close();
	}
}

/**
 * constructs the experimental sharedTree based on the treeData provided.
 * @param tree - tree that you want to apply edits to
 * @param treeData - the data that is referenced to reconstruct the tree
 * @param parentId - parent NodeId that you want to insert the node in
 */
function constructTreeFromTreeData(
	tree: SharedTree,
	nodeIds: NodeId[],
	treeData,
	parentId: StableNodeId | undefined,
	rootNode: boolean,
) {
	const currentParentId =
		parentId === undefined ? tree.currentView.root : tree.convertToNodeId(parentId);
	for (const node of treeData) {
		const currentStableNodeId = node.value as StableNodeId;
		if (!rootNode) {
			const currentNodeId = tree.generateNodeId(currentStableNodeId);
			const currentNode: BuildNode = {
				definition: "Node",
				identifier: currentNodeId,
			};
			// apply the edit to the tree
			tree.applyEdit(
				Change.insertTree(
					currentNode,
					StablePlace.atEndOf({
						parent: currentParentId,
						label: "foo" as TraitLabel,
					}),
				),
			);
			nodeIds.push(currentNodeId);
		}
		if (node.fields?.foo !== undefined) {
			constructTreeFromTreeData(tree, nodeIds, node.fields.foo, currentStableNodeId, false);
		}
	}
}

interface experimentalTreeNode {
	identifier: string;
	parent: NodeId | undefined;
	parentLabel: TraitLabel | undefined;
	traits: ReadonlyMap<TraitLabel, readonly NodeId[]>;
}
interface JsonableTreeNode {
	identifier: string;
	parent: NodeId | undefined;
	parentLabel: TraitLabel | undefined;
	fields: any;
}
/**
 * converts the experimental sharedTree to JsonableTree
 * @param tree - experimental sharedTree that needs to be converted to a JsonableTree
 */
export function transformTreeToJsonableString(tree: SharedTree): string {
	const flat: experimentalTreeNode[] = [];
	const testNodes: TreeViewNode[] = [];
	for (const node of tree.currentView) {
		const stableNodeId = tree.convertToStableNodeId(node.identifier) as string;
		let stableParentNodeId;
		if (node.parentage?.parent !== undefined) {
			stableParentNodeId = tree.convertToStableNodeId(node.parentage?.parent) as string;
		}
		const currentNode: experimentalTreeNode = {
			identifier: stableNodeId,
			parent: stableParentNodeId,
			parentLabel: node.parentage?.label,
			traits: node.traits,
		};
		flat.push(currentNode);
		testNodes.push(node);
	}
	const nodes: JsonableTreeNode[] = [];
	const levelOrderedNodes: JsonableTreeNode[] = [];
	const nodeLookup = {};

	for (const node of flat) {
		const currentNode: JsonableTreeNode = {
			identifier: node.identifier,
			parent: node.parent,
			parentLabel: node.parentLabel,
			fields: {}, // replaces traits to comply with JsonableTree
		};
		nodeLookup[node.identifier] = currentNode;
		nodes.push(currentNode);
		if (node.parent === undefined) {
			levelOrderedNodes.push(currentNode);
		}
	}

	for (const node of nodes) {
		if (!(node.parent === undefined)) {
			if (nodeLookup[node.parent].fields[node.parentLabel] === undefined) {
				nodeLookup[node.parent].fields[node.parentLabel] = [];
			}
			const currentNode: JsonableTree = {
				type: brand("Node"),
				value: node.identifier,
				fields: node.fields,
			};
			nodeLookup[node.parent].fields[node.parentLabel] = nodeLookup[node.parent].fields[
				node.parentLabel
			].concat([currentNode]);
		}
	}

	const jsonableTree: JsonableTree = {
		type: brand("Node"),
		value: levelOrderedNodes[0].identifier,
		fields: levelOrderedNodes[0].fields,
	};
	return JSON.stringify(jsonableTree);
}
