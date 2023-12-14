/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { normal, randomColor, rnd } from "./rnd";

/**
 * @internal
 */
export interface IArrayish<T>
	extends ArrayLike<T>,
		Pick<T[], "push" | "pop" | "map">,
		Iterable<T> {}

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
	clientId: string;
	color: string;
	bubbles: IBubble[];
}

/**
 * @internal
 */
export interface IAppState {
	readonly localClient: IClient;
	readonly clients: IArrayish<IClient>;
	readonly width: number;
	readonly height: number;
	setSize(width?: number, height?: number);
	increaseBubbles(): void;
	decreaseBubbles(): void;
	applyEdits(): void;
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

// eslint-disable-next-line jsdoc/require-description
/**
 * @internal
 */
export const makeClient = (
	stageWidth: number,
	stageHeight: number,
	numBubbles: number,
): IClient => ({
	clientId: "pending",
	color: randomColor(),
	bubbles: Array.from({ length: numBubbles }).map(() => makeBubble(stageWidth, stageHeight)),
});
