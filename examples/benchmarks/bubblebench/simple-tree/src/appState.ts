/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	IAppState,
	makeBubble,
	randomColor,
	type IBubble,
	type ITreeClient,
} from "@fluid-example/bubblebench-common";
import type { TreeView } from "@fluidframework/tree";
import { Client, type App, type Bubble } from "./schema.js";

export class AppState implements IAppState {
	readonly localClient: Client;

	constructor(
		private readonly tree: TreeView<App>,
		public width: number,
		public height: number,
		numBubbles: number,
	) {
		this.tree.root.clients.insertAtEnd(
			this.createInitialClientNode(numBubbles) as unknown as Client,
		);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const lastClient = this.tree.root.clients.at(this.tree.root.clients.length - 1)!;
		this.localClient = lastClient;

		console.log(
			`created client with id ${this.localClient.clientId} and color ${this.localClient.color}`,
		);
	}

	public applyEdits() {}

	createInitialClientNode(numBubbles: number): ITreeClient {
		const bubbles: IBubble[] = [];
		// create and add initial bubbles to initial client json tree
		for (let i = 0; i < numBubbles; i++) {
			const bubble = makeBubble(this.width, this.height);
			bubbles.push(bubble);
		}

		const client: ITreeClient = {
			clientId: `${Math.random()}`,
			color: randomColor(),
			bubbles,
		};

		return client;
	}

	public get clients() {
		return [...this.tree.root.clients];
	}

	public setSize(width?: number, height?: number) {
		this.width = width ?? 640;
		this.height = height ?? 480;
	}

	public increaseBubbles() {
		this.localClient.bubbles.insertAtEnd(makeBubble(this.width, this.height) as Bubble);
	}

	public decreaseBubbles() {
		const bubbles = this.localClient.bubbles;
		if (bubbles.length > 1) {
			bubbles.removeAt(bubbles.length - 1);
		}
	}
}
