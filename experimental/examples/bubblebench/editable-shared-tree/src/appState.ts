/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IAppState, IClient, makeBubble, randomColor } from "@fluid-example/bubblebench-common";
import { brand, EditableField, FieldKey } from "@fluid-internal/tree";
import { Client } from "./client";
import { ClientTreeProxy } from "./schema";

export class AppState implements IAppState {
	static clientsFieldKey: FieldKey = brand("clients");
	readonly localClient: Client;

	constructor(
		private readonly clientsSequence: ClientTreeProxy[] & EditableField,
		public width: number,
		public height: number,
		numBubbles: number,
	) {
		clientsSequence[clientsSequence.length] = this.createInitialClientNode(
			numBubbles,
		) as ClientTreeProxy;
		this.localClient = new Client(clientsSequence[clientsSequence.length - 1]);

		console.log(
			`created client with id ${this.localClient.clientId} and color ${this.localClient.color}`,
		);
	}

	public applyEdits() {}

	createInitialClientNode(numBubbles: number): IClient {
		const client: IClient = {
			clientId: `${Math.random()}`,
			color: randomColor(),
			bubbles: [],
		};

		// create and add initial bubbles to initial client json tree
		for (let i = 0; i < numBubbles; i++) {
			const bubble = makeBubble(this.width, this.height);
			client.bubbles.push(bubble);
		}

		return client;
	}

	public get clients() {
		return [...this.clientsSequence].map((clientTreeProxy) => new Client(clientTreeProxy));
	}

	public setSize(width?: number, height?: number) {
		this.width = width ?? 640;
		this.height = height ?? 480;
	}

	public increaseBubbles() {
		this.localClient.increaseBubbles(makeBubble(this.width, this.height));
	}

	public decreaseBubbles() {
		this.localClient.decreaseBubbles();
	}
}
