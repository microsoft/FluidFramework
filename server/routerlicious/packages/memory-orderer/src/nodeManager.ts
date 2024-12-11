/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { EventEmitter } from "events";
import { MongoManager } from "@fluidframework/server-services-core";
import { IConcreteNode } from "./interfaces";
import { RemoteNode } from "./remoteNode";

/**
 * Tracks the validity of a set of nodes.
 * @internal
 */
export class NodeManager extends EventEmitter {
	// Every node we have ever loaded
	private readonly nodes = new Map<string, IConcreteNode>();
	// Nodes we are attempting to load
	private readonly pendingNodes = new Map<string, Promise<IConcreteNode>>();

	constructor(
		private readonly mongoManager: MongoManager,
		private readonly nodeCollectionName: string,
	) {
		super();
	}

	/**
	 * Registers a new local node with the NodeManager
	 */
	public registerLocal(node: IConcreteNode): void {
		// Verify the node hasn't been previously registered
		assert(!this.nodes.has(node.id));
		assert(!this.pendingNodes.has(node.id));

		// Add the local node to the list. We do not add it to the valid list because we do not track the validity
		// of a local node.
		this.nodes.set(node.id, node);
	}

	/**
	 * Loads the given remote node with the provided ID
	 */
	public async loadRemote(id: string): Promise<IConcreteNode> {
		// Return immediately if have the resolved value
		const existingNode = this.nodes.get(id);
		if (existingNode !== undefined) {
			return existingNode;
		}

		// Otherwise return a promise for the node
		const existingPendingNode = this.pendingNodes.get(id);
		if (existingPendingNode !== undefined) {
			return existingPendingNode;
		}

		// Otherwise load in the information
		const pendingNodeP = this.getNode(id);
		this.pendingNodes.set(id, pendingNodeP);

		return pendingNodeP;
	}

	private async getNode(id: string): Promise<IConcreteNode> {
		const node = await RemoteNode.connect(id, this.mongoManager, this.nodeCollectionName);
		this.nodes.set(id, node);

		// TODO Register for node events here
		// node.on("error", (error) => { });

		return node;
	}
}
