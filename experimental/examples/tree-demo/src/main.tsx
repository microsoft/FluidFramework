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
import useResizeObserver from "use-resize-observer";
import { IStage, StageView } from "./stage";
import { ClientManager, BubbleProxy, makeBubble } from "./model";
import { Stats } from "./stats";

const stage: IStage = {
    width: 640,
    height: 480,
};

export class TreeDemo extends DataObject implements IFluidHTMLView {
    private readonly stats = new Stats();
    private readonly bubble0 = new BubbleProxy();
    private readonly bubble1 = new BubbleProxy();

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

        const App = () => {
            const view = this.tree.currentView;
            const bubbles = this.clientManager.localBubbles(view);

            if (this.stats.smoothFps > 31) {
                this.clientManager.addBubble(this.tree, this.makeBubble());
            } else if (this.stats.smoothFps < 30) {
                this.clientManager.removeBubble(this.tree);
            }

            const changes: Change[] = [];
            for (const bubbleId of bubbles) {
                this.bubble0.moveTo(view, bubbleId);
                changes.push(...this.bubble0.move(stage, view));
            }

            // Collide local bubbles with selves
            for (let i = 0; i < bubbles.length; i++) {
                this.bubble0.moveTo(view, bubbles[i]);
                for (let j = i + 1; j < bubbles.length; j++) {
                    this.bubble1.moveTo(view, bubbles[j]);
                    changes.push(...this.bubble0.collide(this.bubble1));
                }
            }

            let bubbleCount = bubbles.length;

            // Collide local bubbles with remote bubbles
            this.clientManager.forEachRemoteBubble(view, (remoteBubble) => {
                bubbleCount++;

                for (const bubbleId of bubbles) {
                    this.bubble0.moveTo(view, bubbleId);
                    changes.push(...this.bubble0.collide(remoteBubble));
                }
            });

            this.tree.applyEdit(...changes);

            // Observe changes to the visible size and update physics accordingly.
            const { ref } = useResizeObserver<HTMLDivElement>({
                onResize: ({ width, height }) => {
                    stage.width = width as number;
                    stage.height = height as number;
                },
            });

            return (
                <div ref={ref} style={{ position: "absolute", inset: "0px" }}>
                    <div>{`${bubbles.length}/${bubbleCount} bubbles @ ${
                        formatFloat(this.stats.smoothFps)} fps (${this.stats.lastFrameElapsed} ms)`}</div>
                    <div>{`Total FPS: ${formatFloat(this.stats.totalFps)} (Glitches: ${this.stats.glitchCount})`}</div>
                    <StageView
                        width={stage.width}
                        height={stage.height}
                        tree={this.tree.currentView}
                        mgr={this.clientManager}></StageView>
                </div>
            );
        };

        const renderLoop = () => {
            ReactDOM.render(
                <div style={{ position: "absolute", inset: "0px" }}>
                    <App></App>
                </div>, div);
            requestAnimationFrame(renderLoop);
            this.stats.endFrame();
        };

        this.stats.start();
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
