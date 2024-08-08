/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";

import { Stats } from "../stats.js";
import { IAppState, IBubble } from "../types.js";

import { StageView } from "./stage.js";
import { useResizeObserver } from "./useResizeObserver.cjs";

const formatFloat = (n: number): number => Math.round(n * 10) / 10;
interface IAppProps {
	app: IAppState;
}

function move(bubble: IBubble, width: number, height: number): void {
	let { x, y } = bubble;
	const { vx, vy, r } = bubble;

	bubble.x = x += vx;
	bubble.y = y += vy;

	// Reflect Bubbles off walls.
	if (vx < 0 && x < r) {
		bubble.vx = -vx;
	} else if (vx > 0 && x > width - r) {
		bubble.vx = -vx;
	}

	if (vy < 0 && y < r) {
		bubble.vy = -vy;
	} else if (vy > 0 && y > height - r) {
		bubble.vy = -vy;
	}
}

function collide(left: IBubble, right: IBubble): void {
	const dx = left.x - right.x;
	const dy = left.y - right.y;
	const distance2 = dx * dx + dy * dy;

	const threshold = left.r + right.r;
	const threshold2 = threshold * threshold;

	// Reject bubbles whose centers are too far away to be touching.
	if (distance2 > threshold2) {
		return;
	}

	const { vx: lvx, vy: lvy } = left;
	const { vx: rvx, vy: rvy } = right;

	const dvx = lvx - rvx;
	const dvy = lvy - rvy;
	let impulse = dvx * dx + dvy * dy;

	// Reject bubbles that are traveling in the same direction.
	if (impulse > 0) {
		return;
	}

	impulse /= distance2;

	left.vx = lvx - dx * impulse;
	left.vy = lvy - dy * impulse;
	right.vx = rvx + dx * impulse;
	right.vy = rvy + dy * impulse;
}

// eslint-disable-next-line jsdoc/require-description
/**
 * @internal
 */
export const AppView: React.FC<IAppProps> = ({ app }: IAppProps) => {
	const [stats] = useState<Stats>(new Stats());
	const [, setFrame] = useState<number>(0);

	useEffect(() => {
		app.runTransaction(() => {
			const localBubbles = app.localClient.bubbles;

			// Move each bubble
			for (const bubble of localBubbles) {
				move(bubble, app.width, app.height);
			}

			// Handle collisions between each pair of local bubbles
			for (let i = 0; i < localBubbles.length; i++) {
				const left = localBubbles[i];
				for (let j = i + 1; j < localBubbles.length; j++) {
					const right = localBubbles[j];
					collide(left, right);
				}
			}

			// Handle collisions between local bubbles and remote bubbles (but not between pairs
			// of remote bubbles.)
			for (const client of app.clients) {
				if (client.clientId === app.localClient.clientId) {
					continue;
				}
				for (const right of client.bubbles) {
					for (const left of localBubbles) {
						collide(left, right);
					}
				}
			}

			// Scale the number of local bubbles to target 22-23 fps.  We choose 22-23 fps because it
			// is below 23.98, the lowest display refresh rate typically encountered on modern displays.
			if (!(stats.smoothFps > 22)) {
				app.decreaseBubbles();
			} else if (stats.smoothFps > 23) {
				app.increaseBubbles();
			}

			app.applyEdits();
		});
	});

	// Force a render each frame.
	requestAnimationFrame(() => {
		setFrame((currentFrame) => currentFrame + 1);
	});

	stats.endFrame();

	// Observe changes to the visible size and update physics accordingly.
	const { ref } = useResizeObserver<HTMLDivElement>({
		onResize: ({ width, height }) => {
			app.setSize(width, height);
		},
	});

	let bubbleCount = 0;
	for (const client of app.clients) {
		bubbleCount += client.bubbles.length;
	}

	return (
		<div ref={ref} style={{ position: "absolute", inset: "0px" }}>
			<div>{`${app.localClient.bubbles.length}/${bubbleCount} bubbles @${formatFloat(
				stats.smoothFps,
			)} fps (${stats.lastFrameElapsed} ms)`}</div>
			<div>{`Total FPS: ${formatFloat(stats.totalFps)} (Glitches: ${stats.glitchCount})`}</div>
			<StageView app={app}></StageView>
		</div>
	);
};
