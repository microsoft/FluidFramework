/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IAppState,
	type IBubble,
	type IClient,
	makeBubble,
	randomColor,
} from "@fluid-example/bubblebench-common";
import { type TreeView, Tree } from "@fluidframework/tree";

import { type App, Client } from "./schema.js";

export class AppState implements IAppState {
	readonly localClient: Client;

	constructor(
		private readonly tree: TreeView<typeof App>,
		public width: number,
		public height: number,
		numBubbles: number,
	) {
		this.localClient = new Client(this.createInitialClientNode(numBubbles));
		this.tree.root.clients.insertAtEnd(this.localClient);

		console.log(
			`created client with id ${this.localClient.clientId} and color ${this.localClient.color}`,
		);
	}

	public applyEdits() {}

	createInitialClientNode(numBubbles: number): IClient {
		const bubbles: IBubble[] = [];
		// create and add initial bubbles to initial client json tree
		for (let i = 0; i < numBubbles; i++) {
			const bubble = makeBubble(this.width, this.height);
			bubbles.push(bubble);
		}

		const client: IClient = {
			clientId: `${Math.random()}`,
			color: randomColor(),
			bubbles,
		};

		return client;
	}

	public get clients() {
		return this.tree.root.clients;
	}

	public setSize(width?: number, height?: number) {
		this.width = width ?? 640;
		this.height = height ?? 480;
	}

	public increaseBubbles() {
		this.localClient.bubbles.insertAtEnd(makeBubble(this.width, this.height));
	}

	public decreaseBubbles() {
		const bubbles = this.localClient.bubbles;
		if (bubbles.length > 1) {
			bubbles.removeAt(bubbles.length - 1);
		}
	}

	public runTransaction(inner: () => void): void {
		Tree.runTransaction(this.localClient, inner);
	}
}
