/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { TestTreeProvider } from "../../utils";
import { AppState } from "./AppState";
import { Bubblebench } from "./Bubblebench";
import { Client } from "./Client";
import { AppStateTreeProxy } from "./schema";

describe("BubbleBenchEditableTree", () => {
    describe("AppState", () => {
        it("constructor() - creates new client and pushes it to the end of the clients sequence", async () => {
            const provider = await TestTreeProvider.create(1);
            const tree = provider.trees[0];
            assert(tree.isAttached());
            new Bubblebench().initializeTree(tree);
            const rootAppStateProxy = tree.root as AppStateTreeProxy;
            assert.equal(rootAppStateProxy.clients.length, 0);

            // insert (pushing to end of sequence) 2 new clients into rootAppState
            const initialBubblesNum = 2;
            const appState1 = new AppState(rootAppStateProxy, 640, 320, initialBubblesNum);
            assert.equal(appState1.clients.length, 1);
            const expectedLocalClient = new Client(
                rootAppStateProxy.clients[rootAppStateProxy.clients.length - 1],
            );
            assert.equal(appState1.localClient.clientId, expectedLocalClient.clientId);
            assert(appState1.localClient.bubbles.length === initialBubblesNum);

            const appState2 = new AppState(rootAppStateProxy, 640, 320, initialBubblesNum);
            assert.equal(appState2.clients.length, 2);
            const expectedLocalClient2 = new Client(
                rootAppStateProxy.clients[rootAppStateProxy.clients.length - 1],
            );
            assert.equal(appState2.localClient.clientId, expectedLocalClient2.clientId);
            assert(appState2.localClient.bubbles.length === initialBubblesNum);
        });

        it("increaseBubbles()", async () => {
            const provider = await TestTreeProvider.create(1);
            const tree = provider.trees[0];
            assert(tree.isAttached());
            new Bubblebench().initializeTree(tree);
            const rootAppStateProxy = tree.root as AppStateTreeProxy;
            assert.equal(rootAppStateProxy.clients.length, 0);

            // Create 2 new clients into rootAppState
            const initialBubblesNum = 2;
            const appState1 = new AppState(rootAppStateProxy, 640, 320, initialBubblesNum);
            assert.equal(appState1.clients.length, 1);
            const expectedLocalClient = new Client(
                rootAppStateProxy.clients[rootAppStateProxy.clients.length - 1],
            );
            assert.equal(appState1.localClient.clientId, expectedLocalClient.clientId);
            assert(appState1.localClient.bubbles.length === initialBubblesNum);

            const appState2 = new AppState(rootAppStateProxy, 640, 320, initialBubblesNum);
            assert.equal(appState2.clients.length, 2);
            const expectedLocalClient2 = new Client(
                rootAppStateProxy.clients[rootAppStateProxy.clients.length - 1],
            );
            assert.equal(appState2.localClient.clientId, expectedLocalClient2.clientId);
            assert(appState2.localClient.bubbles.length === initialBubblesNum);

            appState2.increaseBubbles();
            appState2.increaseBubbles();
            appState2.increaseBubbles();
            await provider.ensureSynchronized();
            assert(appState2.localClient.bubbles.length === initialBubblesNum + 3);
            // ensure only appState2's local client had bubbles increased
            assert(appState1.localClient.bubbles.length === initialBubblesNum);
        });

        it("decreaseBubbles()", async () => {
            const provider = await TestTreeProvider.create(1);
            const tree = provider.trees[0];
            assert(tree.isAttached());
            new Bubblebench().initializeTree(tree);
            const rootAppStateProxy = tree.root as AppStateTreeProxy;
            assert.equal(rootAppStateProxy.clients.length, 0);

            // Create 2 new clients into rootAppState
            const initialBubblesNum = 2;
            const appState1 = new AppState(rootAppStateProxy, 640, 320, initialBubblesNum);
            assert.equal(appState1.clients.length, 1);
            const expectedLocalClient = new Client(
                rootAppStateProxy.clients[rootAppStateProxy.clients.length - 1],
            );
            assert.equal(appState1.localClient.clientId, expectedLocalClient.clientId);
            assert(appState1.localClient.bubbles.length === initialBubblesNum);

            const appState2 = new AppState(rootAppStateProxy, 640, 320, initialBubblesNum);
            assert.equal(appState2.clients.length, 2);
            const expectedLocalClient2 = new Client(
                rootAppStateProxy.clients[rootAppStateProxy.clients.length - 1],
            );
            assert.equal(appState2.localClient.clientId, expectedLocalClient2.clientId);
            assert(appState2.localClient.bubbles.length === initialBubblesNum);

            appState2.decreaseBubbles();
            await provider.ensureSynchronized();
            assert(appState2.localClient.bubbles.length === initialBubblesNum - 1);
            // ensure only appState2's local client had bubbles increased
            assert(appState1.localClient.bubbles.length === initialBubblesNum);
        });
    });
});

// Simulates the client logic of the bubble bench react application
// (see experimental/examples/bubblebench/common/src/view/app.tsx)
// async function simulateBubbleBenchClientLogic(
//     appState: AppState,
//     iterations: number,
//     provider: ITestTreeProvider,
// ) {
//     for (let frame = 0; frame < iterations; frame++) {
//         const startTime = Date.now();

//         // 1. Move each bubble
//         const localBubbles = appState.localClient.bubbles;
//         for (const bubble of localBubbles) {
//             move(bubble, appState.width, appState.height);
//         }

//         // 2. Handle collisions between each pair of local bubbles
//         for (let i = 0; i < localBubbles.length; i++) {
//             const left = localBubbles[i];
//             for (let j = i + 1; j < localBubbles.length; j++) {
//                 const right = localBubbles[j];
//                 collide(left, right);
//             }
//         }

//         // 3. Handle collisions between local bubbles and remote bubbles (but not between pairs
//         // of remote bubbles.)
//         for (const client of appState.clients) {
//             if (client.clientId === appState.localClient.clientId) {
//                 continue;
//             }
//             for (const right of client.bubbles) {
//                 for (const left of localBubbles) {
//                     collide(left, right);
//                 }
//             }
//         }

//         const executionTimeMs = startTime - Date.now();
//         const twentyTwoFPSRemainder = 45.45 - executionTimeMs;
//         if (twentyTwoFPSRemainder > 0) {
//             // The iteration "frame" completed faster than required to reach 22FPS
//             appState.increaseBubblesT({
//                 x: getRandomInt(0, 99),
//                 y: getRandomInt(0, 99),
//                 vx: getRandomInt(0, 99),
//                 vy: getRandomInt(0, 99),
//                 r: getRandomInt(0, 99),
//             });
//         } else {
//             // The iteration "frame" completed slower than required to reach 22FPS
//             appState.decreaseBubbles();
//         }

//         appState.applyEdits();
//         await provider.ensureSynchronized();
//     }
// }

// function move(bubble: Bubble, width: number, height: number) {
//     let { x, y } = bubble;
//     const { vx, vy, r } = bubble;

//     bubble.x = x += vx;
//     bubble.y = y += vy;

//     // Reflect Bubbles off walls.
//     if (vx < 0 && x < r) {
//         bubble.vx = -vx;
//     } else if (vx > 0 && x > width - r) {
//         bubble.vx = -vx;
//     }

//     if (vy < 0 && y < r) {
//         bubble.vy = -vy;
//     } else if (vy > 0 && y > height - r) {
//         bubble.vy = -vy;
//     }
// }

// function collide(left: Bubble, right: Bubble): void {
//     const dx = left.x - right.x;
//     const dy = left.y - right.y;
//     const distance2 = dx * dx + dy * dy;

//     const threshold = left.r + right.r;
//     const threshold2 = threshold * threshold;

//     // Reject bubbles whose centers are too far away to be touching.
//     if (distance2 > threshold2) {
//         return;
//     }

//     const { vx: lvx, vy: lvy } = left;
//     const { vx: rvx, vy: rvy } = right;

//     const dvx = lvx - rvx;
//     const dvy = lvy - rvy;
//     let impulse = dvx * dx + dvy * dy;

//     // Reject bubbles that are traveling in the same direction.
//     if (impulse > 0) {
//         return;
//     }

//     impulse /= distance2;

//     left.vx = lvx - dx * impulse;
//     left.vy = lvy - dy * impulse;
//     right.vx = rvx + dx * impulse;
//     right.vy = rvy + dy * impulse;
// }

// function getRandomInt(min: number, max: number) {
//     return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
// }
