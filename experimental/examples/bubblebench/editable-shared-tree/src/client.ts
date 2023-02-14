/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IClient } from "@fluid-example/bubblebench-common";
import { brand, EditableField, FieldKey } from "@fluid-internal/tree";
import { Bubble } from "./bubble";
import { ClientTreeProxy, BubbleTreeProxy } from "./schema";

export class Client implements IClient {
	static bubblesFieldKey: FieldKey = brand("bubbles");

	constructor(public readonly clientTreeProxy: ClientTreeProxy) {}

	public get clientId() {
		return this.clientTreeProxy.clientId;
	}

	public set clientId(value: string) {
		this.clientTreeProxy.clientId = value;
	}

	public get color() {
		return this.clientTreeProxy.color;
	}
	public set color(value: string) {
		this.clientTreeProxy.color = value;
	}

	public get bubbles() {
		return [...this.clientTreeProxy.bubbles].map(
			(bubbleTreeProxy) => new Bubble(bubbleTreeProxy),
		);
	}

	public increaseBubbles(bubble: { x: number; y: number; r: number; vx: number; vy: number }) {
		const bubblesSequenceNode = this.clientTreeProxy.bubbles;
		bubblesSequenceNode[bubblesSequenceNode.length] = bubble as BubbleTreeProxy;
	}

	public decreaseBubbles() {
		if (this.clientTreeProxy.bubbles.length > 1) {
			const bubblesSequenceNode = this.clientTreeProxy[
				Client.bubblesFieldKey
			] as EditableField;
			bubblesSequenceNode.deleteNodes(this.clientTreeProxy.bubbles.length - 1);
		}
	}
}
