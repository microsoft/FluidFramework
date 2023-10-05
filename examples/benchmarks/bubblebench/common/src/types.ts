/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { normal, randomColor, rnd } from "./rnd";

export interface IArrayish<T>
	extends ArrayLike<T>,
		Pick<T[], "push" | "pop" | "map">,
		Iterable<T> {}

export interface IBubble {
	x: number;
	y: number;
	r: number;
	vx: number;
	vy: number;
}

export interface IClient {
	clientId: string;
	color: string;
	bubbles: IArrayish<IBubble>;
}

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

export const makeClient = (
	stageWidth: number,
	stageHeight: number,
	numBubbles: number,
): IClient => ({
	clientId: "pending",
	color: randomColor(),
	bubbles: Array.from({ length: numBubbles }).map(() => makeBubble(stageWidth, stageHeight)),
});
