/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";
import useResizeObserver from "use-resize-observer";
import { AppState } from "../state";
import { IBubble } from "../proxy";
import { Stats } from "../stats";
import { StageView } from "./stage";

const formatFloat = (n: number) => Math.round(n * 10) / 10;
interface IAppProps {
    app: AppState;
}

function move(bubble: IBubble, width: number, height: number) {
    let { x, y } = bubble;
    const { vx, vy, r } = bubble;

    bubble.x = x += vx;
    bubble.y = y += vy;

    // Reflect Bubbles off walls.
    if (vx < 0 && x < r) {
        bubble.vx = -vx;
    } else if (vx > 0 && x > (width - r)) {
        bubble.vx = -vx;
    }

    if (vy < 0 && y < r) {
        bubble.vy = -vy;
    } else if (vy > 0 && y > (height - r)) {
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

export const AppView: React.FC<IAppProps> = ({ app }: IAppProps) => {
    const [stats] = useState<Stats>(new Stats());
    const [size, onResize] = useState<{ width?: number, height?: number }>({ width: 640, height: 480 });
    const [, setFrame] = useState<number>(0);

    useEffect(() => {
        const localBubbles = app.localBubbles;

        for (const bubble of localBubbles) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            move(bubble, size.width!, size.height!);
        }

        for (let i = 0; i < localBubbles.length; i++) {
            const left = localBubbles[i];
            for (let j = i + 1; j < localBubbles.length; j++) {
                const right = localBubbles[j];
                collide(left, right);
            }
        }

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

        if (!(stats.smoothFps > 30)) {
            app.decreaseBubbles();
        } else if (stats.smoothFps > 31) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            app.increaseBubbles(size.width!, size.height!);
        }

        app.applyEdits();
    });

    requestAnimationFrame(() => {
        setFrame((currentFrame) => currentFrame + 1);
    });

    stats.endFrame();

    // Observe changes to the visible size and update physics accordingly.
    const { ref } = useResizeObserver<HTMLDivElement>({ onResize });

    let bubbleCount = 0;
    for (const client of app.clients) {
        bubbleCount += client.bubbles.length;
    }

    return (
        <div ref={ref} style={{ position: "absolute", inset: "0px" }}>
            <div>{`${app.localBubbles.length}/${bubbleCount} bubbles @${
                formatFloat(stats.smoothFps)} fps (${stats.lastFrameElapsed} ms)`}</div>
            <div>{`Total FPS: ${formatFloat(stats.totalFps)} (Glitches: ${stats.glitchCount})`}</div>
            <StageView app={app}></StageView>
        </div>
    );
};
