/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	IAppState,
	makeBubble,
	randomColor,
	type IBubble,
} from "@fluid-example/bubblebench-common";
import { Bubbles, Client, type Bubble, type Clients } from "./schema.js";

export class AppState implements IAppState {
	readonly localClient: Client;

	constructor(
		private readonly clientsSequence: Clients,
		public width: number,
		public height: number,
		numBubbles: number,
	) {
		clientsSequence.insertAtEnd(this.createInitialClientNode(numBubbles));
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const lastClient = clientsSequence.at(clientsSequence.length - 1)!;

		this.localClient = new Client(lastClient);

		console.log(
			`created client with id ${this.localClient.clientId} and color ${this.localClient.color}`,
		);
	}

	public applyEdits() {}

	createInitialClientNode(numBubbles: number): Client {
		const bubbles: IBubble[] = [] as unknown as Bubbles;
		// create and add initial bubbles to initial client json tree
		for (let i = 0; i < numBubbles; i++) {
			const bubble = makeBubble(this.width, this.height);
			bubbles.push(bubble);
		}

		const client: Client = {
			clientId: `${Math.random()}`,
			color: randomColor(),
			bubbles,
		};

		return client;
	}

	public get clients() {
		return Array.from(this.clientsSequence, (client) => new Client(client));
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
