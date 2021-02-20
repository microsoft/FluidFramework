/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import {
    Change,
    SharedTree,
} from "@fluid-experimental/tree";

import React from "react";
import ReactDOM from "react-dom";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IStage, StageView } from "./stage";
import { ClientManager, BubbleProxy, makeBubble } from "./model";
import { Stats } from "./stats";

const stage: IStage = {
    width: 640,
    height: 480,
};

const stats = new Stats();
const bubble0 = new BubbleProxy();
const bubble1 = new BubbleProxy();

export class TreeDemo extends DataObject implements IFluidHTMLView {
    public static get Name() { return "@fluid-experimental/tree-demo"; }
    private maybeTree?: SharedTree = undefined;
    private maybeClientManager?: ClientManager = undefined;
    public get IFluidHTMLView() { return this; }

    private makeBubble() {
        return makeBubble(stage, /* radius: */ 10, /* maxSpeed: */ 2);
    }

    protected async initializingFirstTime() {
        this.maybeTree = SharedTree.create(this.runtime);
        this.root.set("tree", this.maybeTree.handle);
    }

    protected async initializingFromExisting() {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.maybeTree = await this.root.get<IFluidHandle<SharedTree>>("tree")!.get();
    }

    protected async hasInitialized() {
        this.maybeClientManager = new ClientManager(
            this.tree,
            new Array(10).fill(undefined).map(() => this.makeBubble()),
            this.runtime.getAudience(),
        );

        const onConnected = () => {
            // Out of paranoia, we periodically check to see if your client Id has changed and
            // update the tree if it has.
            setInterval(() => {
                const clientId = this.runtime.clientId;
                if (clientId !== undefined && clientId !== this.clientManager.getClientId(this.tree.currentView)) {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    this.clientManager.setClientId(this.tree, this.runtime.clientId!);
                }
            }, 1000);
        };

        // Wait for connection to begin checking client Id.
        if (this.runtime.connected) {
            onConnected();
        } else {
            this.runtime.once("connected", onConnected);
        }
    }

    public render(div: HTMLElement) {
        const formatFloat = (n: number) => Math.round(n * 10) / 10;

        const renderLoop = () => {
            if (stats.smoothFps > 30) {
                this.clientManager.addBubble(this.tree, this.makeBubble());
            } else if (stats.smoothFps < 30) {
                this.clientManager.removeBubble(this.tree);
            }

            const view = this.tree.currentView;
            const bubbles = this.clientManager.localBubbles(view);

            const changes: Change[] = [];
            for (const bubbleId of bubbles) {
                bubble0.moveTo(view, bubbleId);
                changes.push(...bubble0.move(stage, view));
            }

            // Collide local bubbles with selves
            for (let i = 0; i < bubbles.length; i++) {
                bubble0.moveTo(view, bubbles[i]);
                for (let j = i + 1; j < bubbles.length; j++) {
                    bubble1.moveTo(view, bubbles[j]);
                    changes.push(...bubble0.collide(bubble1));
                }
            }

            let bubbleCount = bubbles.length;

            // Collide local bubbles with remote bubbles
            this.clientManager.forEachRemoteBubble(view, (remoteBubble) => {
                bubbleCount++;

                for (const bubbleId of bubbles) {
                    bubble0.moveTo(view, bubbleId);
                    changes.push(...bubble0.collide(remoteBubble));
                }
            });

            this.tree.applyEdit(...changes);

                    <div>{`${bubbles.length}/${bubbleCount} bubbles @ ${
                        formatFloat(this.stats.smoothFps)} fps (${this.stats.lastFrameElapsed} ms)`}</div>
                    <div>{`Total FPS: ${formatFloat(this.stats.totalFps)} (Glitches: ${this.stats.glitchCount})`}</div>
                    <StageView
                        width={stage.width}
                        height={stage.height}
                        tree={this.tree.currentView}
                        mgr={this.clientManager}></StageView>
                </div>,
                div);

            requestAnimationFrame(renderLoop);
            stats.endFrame();
        };

        stats.start();
        renderLoop();
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    private get tree() { return this.maybeTree!; }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    private get clientManager() { return this.maybeClientManager!; }
}

/**
 * The DataObjectFactory declares the Fluid object and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 */
export const TreeDemoInstantiationFactory = new DataObjectFactory(
    TreeDemo.Name,
    TreeDemo,
    [SharedTree.getFactory()],
    {},
);
