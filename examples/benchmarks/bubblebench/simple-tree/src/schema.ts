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

	public get x() {
		return this.x;
	}
	public set x(value: number) {
		this.x = value;
	}

	public get y() {
		return this.y;
	}
	public set y(value: number) {
		this.y = value;
	}

	public get vx() {
		return this.vx;
	}
	public set vx(value: number) {
		this.vx = value;
	}

	public get vy() {
		return this.vy;
	}
	public set vy(value: number) {
		this.vy = value;
	}

	public get r() {
		return this.r;
	}
	public set r(value: number) {
		this.r = value;
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
