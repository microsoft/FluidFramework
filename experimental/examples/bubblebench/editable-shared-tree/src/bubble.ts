/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBubble } from "@fluid-example/bubblebench-common";
import { BubbleTreeProxy } from "./schema";

export class Bubble implements IBubble {
	constructor(public readonly bubbleTreeProxy: BubbleTreeProxy) {}

	public get x() {
		return this.bubbleTreeProxy.x;
	}
	public set x(value: number) {
		this.bubbleTreeProxy.x = value;
	}

	public get y() {
		return this.bubbleTreeProxy.y;
	}
	public set y(value: number) {
		this.bubbleTreeProxy.y = value;
	}

	public get vx() {
		return this.bubbleTreeProxy.vx;
	}
	public set vx(value: number) {
		this.bubbleTreeProxy.vx = value;
	}

	public get vy() {
		return this.bubbleTreeProxy.vy;
	}
	public set vy(value: number) {
		this.bubbleTreeProxy.vy = value;
	}

	public get r() {
		return this.bubbleTreeProxy.r;
	}
	public set r(value: number) {
		this.bubbleTreeProxy.r = value;
	}
}
