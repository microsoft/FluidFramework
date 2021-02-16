/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { Random } from "best-random";
import { IStage } from "./stage";

export interface IBubble {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    c: string;
}

export const BubbleView: React.FC<{ data: IBubble }> = (props: { data: IBubble }) =>
    <g transform={`translate(${props.data.x},${props.data.y})`}>
        <circle r={26}
            fill={props.data.c}
            fillOpacity={0.3}
            stroke={props.data.c}
            strokeWidth={2.66667}
            strokeOpacity={0.5}>
        </circle>
        <circle r={23} fill={props.data.c} fillOpacity={0.05}></circle>
        <ellipse cx={-10} cy={-12} rx={5} ry={8} transform="rotate(50,-10,-12)" fill="white" />
    </g>;

// eslint-disable-next-line no-bitwise
const random = new Random((Math.random() * 0x100000000) | 0);

function randomColor() {
    // eslint-disable-next-line no-bitwise
    const channel = () => (32 + (random.float64() * 196) | 0).toString(16).padStart(2, "0");
    return `#${channel()}${channel()}${channel()}`;
}

export function makeBubble(
    { width, height }: IStage,
    radius: number,
    maxSpeed: number,
): IBubble {
    const diameter = radius * 2;
    return {
        x: radius + (width - diameter) * random.float64(),
        y: radius + (height - diameter) * random.float64(),
        vx: maxSpeed * (random.float64() * 2 - 1),
        vy: maxSpeed * (random.float64() * 2 - 1),
        r: 26,
        c: randomColor(),
    };
}

export function moveBubble(stage: IStage, bubble: IBubble) {
    bubble.x += bubble.vx;
    bubble.y += bubble.vy;

    // Reflect Bubbles off walls.
    if (bubble.vx < 0 && bubble.x < bubble.r) {
        bubble.vx = -bubble.vx;
    }
    else if (bubble.vx > 0 && bubble.x > stage.width - bubble.r) {
        bubble.vx = -bubble.vx;
    }

    if (bubble.vy < 0 && bubble.y < bubble.r) {
        bubble.vy = -bubble.vy;
    }
    else if (bubble.vy > 0 && bubble.y > stage.height - bubble.r) {
        bubble.vy = -bubble.vy;
    }
}

export function collideBubbles(left: IBubble, right: IBubble) {
    const dx = left.x - right.x;
    const dy = left.y - right.y;
    const distance2 = dx * dx + dy * dy;
    const diameter = left.r + right.r;
    const diameter2 = diameter * diameter;

    if (distance2 > diameter2) {
        return; // Bubbles are not touching, no collision.
    }

    const dvx = left.vx - right.vx;
    const dvy = left.vy - right.vy;
    let impulse = dvx * dx + dvy * dy;
    if (impulse > 0) {      // Bubbles moving in the same direction are
        return;             // not colliding.
    }

    impulse /= distance2;
    left.vx -= dx * impulse;
    left.vy -= dy * impulse;
    right.vx += dx * impulse;
    right.vy += dy * impulse;
}
