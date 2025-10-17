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
	type SimpleClient,
} from "@fluid-example/bubblebench-common";
import type { SharedJson1 } from "@fluid-experimental/sharejs-json1";

import { observe } from "./proxy/index.js";

interface IApp {
	clients: IArrayish<SimpleClient>;
}

interface IArrayish<T> extends ArrayLike<T>, Pick<T[], "push">, Iterable<T> {}

export class AppState implements IAppState {
	private readonly root: IApp;

	public readonly localClient: SimpleClient;

	constructor(
		tree: SharedJson1,
		private _width: number,
		private _height: number,
		numBubbles: number,
	) {
		this.root = observe(tree.get() as unknown as IApp, (op) => tree.apply(op));

		const client = {
			clientId: "pending",
			color: randomColor(),
			bubbles: Array.from({ length: numBubbles })
				.fill(undefined)
				.map(() => this.makeBubble()),
		};

		const length = this.root.clients.push(client);
		this.localClient = this.root.clients[length - 1];
	}

	public applyEdits(): void {}

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

	public get clients(): IArrayish<IClient> {
		return this.root.clients;
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
