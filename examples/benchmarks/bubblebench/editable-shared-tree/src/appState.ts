/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IAppState, makeBubble, randomColor } from "@fluid-example/bubblebench-common";
import { cursorFromContextualData } from "@fluid-experimental/tree2";
import { ClientWrapper } from "./client";
import { ClientsField, FlexClient, FlexBubble, rootAppStateSchema } from "./schema";

export class AppState implements IAppState {
	readonly localClient: ClientWrapper;

	constructor(
		private readonly clientsSequence: ClientsField,
		public width: number,
		public height: number,
		numBubbles: number,
	) {
		clientsSequence.insertNodes(
			clientsSequence.length,
			cursorFromContextualData(
				{
					schema: clientsSequence.context.schema,
					fieldSource: () => undefined,
				},
				rootAppStateSchema.types,
				this.createInitialClientNode(numBubbles),
			),
		);
		this.localClient = new ClientWrapper(clientsSequence[clientsSequence.length - 1]);

		console.log(
			`created client with id ${this.localClient.clientId} and color ${this.localClient.color}`,
		);
	}

	public applyEdits() {}

	createInitialClientNode(numBubbles: number): FlexClient {
		const bubbles: FlexBubble[] = [];
		// create and add initial bubbles to initial client json tree
		for (let i = 0; i < numBubbles; i++) {
			const bubble = makeBubble(this.width, this.height);
			bubbles.push(bubble);
		}

		const client: FlexClient = {
			clientId: `${Math.random()}`,
			color: randomColor(),
			bubbles,
		};

		return client;
	}

	public get clients() {
		return Array.from(
			this.clientsSequence,
			(clientTreeProxy) => new ClientWrapper(clientTreeProxy),
		);
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
