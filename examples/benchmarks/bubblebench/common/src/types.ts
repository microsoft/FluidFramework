/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { normal, randomColor, rnd } from "./rnd.js";

/**
 * @internal
 */
export interface IBubble {
	x: number;
	y: number;
	r: number;
	vx: number;
	vy: number;
}

/**
 * @internal
 */
export interface IClient {
	readonly clientId: string;
	readonly color: string;
	// Mark `IBubble[]` as read-only, as SharedTree ArrayNodes are not compatible with JavaScript arrays for writing purposes.
	readonly bubbles: readonly IBubble[];
}

/**
 * @internal
 */
export interface IAppState {
	readonly localClient: IClient;
	readonly clients: Iterable<IClient>;
	readonly width: number;
	readonly height: number;
	setSize(width?: number, height?: number);
	increaseBubbles(): void;
	decreaseBubbles(): void;
	applyEdits(): void;
	runTransaction(inner: () => void);
}

// eslint-disable-next-line jsdoc/require-description
/**
 * @internal
 */
export function makeBubble(stageWidth: number, stageHeight: number): IBubble {
	const radius = Math.max(normal() * 10 + 10, 3);
	const maxSpeed = 4;
	const diameter = radius * 2;

	return {
		x: radius + (stageWidth - diameter) * rnd.float64(),
		y: radius + (stageHeight - diameter) * rnd.float64(),
		r: radius,
		vx: maxSpeed * (rnd.float64() * 2 - 1),
		vy: maxSpeed * (rnd.float64() * 2 - 1),
	};
}

/**
 * Simple mutable type implementing IClient.
 */
export interface SimpleClient extends IClient {
	clientId: string;
	readonly color: string;
	readonly bubbles: IBubble[];
}

/**
 * Creates a SimpleClient with random values.
 * @internal
 */
export function makeClient(
	stageWidth: number,
	stageHeight: number,
	numBubbles: number,
): SimpleClient {
	return {
		clientId: "pending",
		color: randomColor(),
		bubbles: Array.from({ length: numBubbles }).map(() => makeBubble(stageWidth, stageHeight)),
	};
}
