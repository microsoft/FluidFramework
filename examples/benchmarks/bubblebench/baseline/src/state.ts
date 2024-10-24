/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IAppState,
	IBubble,
	SimpleClient,
	makeBubble,
	makeClient,
} from "@fluid-example/bubblebench-common";

export class AppState implements IAppState {
	public readonly applyEdits = (): void => {};
	public readonly localClient: SimpleClient;
	public readonly clients: SimpleClient[];

	constructor(
		private _width: number,
		private _height: number,
		numBubbles: number,
	) {
		this.localClient = makeClient(_width, _height, numBubbles);
		this.clients = [this.localClient];
	}

	public setSize(width?: number, height?: number): void {
		this._width = width ?? 640;
		this._height = height ?? 480;
	}

	public get width(): number {
		return this._width;
	}
	public get height(): number {
		return this._height;
	}

	private makeBubble(): IBubble {
		return makeBubble(this.width, this.height);
	}

	public increaseBubbles(): void {
		this.localClient.bubbles.push(this.makeBubble());
	}

	public decreaseBubbles(): void {
		const bubbles = this.localClient.bubbles;
		if (bubbles.length > 1) {
			bubbles.pop();
		}
	}

	public runTransaction(inner: () => void): void {
		inner();
	}
}
