/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IBubble, ITreeClient } from "@fluid-example/bubblebench-common";
import { SchemaFactory, TreeConfiguration } from "@fluidframework/tree";

const sf = new SchemaFactory("bubble-bench-simple-tree");

export class Bubble
	extends sf.object("Bubble", {
		x: sf.number,
		y: sf.number,
		r: sf.number,
		vx: sf.number,
		vy: sf.number,
	})
	implements IBubble
{
	constructor(public readonly bubble: IBubble) {
		super(bubble);
	}
}

export class Client
	extends sf.object("Client", {
		clientId: sf.string,
		color: sf.string,
		bubbles: sf.array("Bubbles", Bubble),
	})
	implements ITreeClient
{
	public get clientId() {
		return this.clientId;
	}

	public set clientId(value: string) {
		this.clientId = value;
	}

	public get color() {
		return this.color;
	}

	public set color(value: string) {
		this.color = value;
	}
}

export class Clients extends sf.array("Clients", Client) {}

// Root type
export class App extends sf.object("App", {
	clients: Clients,
}) {}

export const appTreeConfiguration = new TreeConfiguration(
	App, // root node
	() => ({
		// initial tree
		clients: [],
	}),
);
