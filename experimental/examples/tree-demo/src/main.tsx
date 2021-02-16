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
    Definition,
    EditNode,
    NodeId,
    SharedTree,
    StablePlace,
    TraitLabel,
} from "@fluid-experimental/tree";

import React from "react";
import ReactDOM from "react-dom";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { IStage, StageView } from "./stage";
import { collideBubbles, makeBubble, moveBubble } from "./bubble";

const stage: IStage = {
    width: 640,
    height: 480,
};

const bubbles = new Array(10).fill(undefined).map(() => makeBubble(stage, 26, 4));

export class TreeDemo extends DataObject implements IFluidHTMLView {
    public static get Name() { return "@fluid-experimental/tree-demo"; }
    private maybeTree?: SharedTree = undefined;
    public get IFluidHTMLView() { return this; }

    protected async initializingFirstTime() {
        this.maybeTree = SharedTree.create(this.runtime);
        this.root.set("tree", this.maybeTree.handle);

        for (let i = 0; i < 3; i++) {
            this.tree.editor.insert(
                this.makeBox(/* x: */ i * 120, /* y: */ 0, /* color: */ ["red", "green", "blue"][i]),
                StablePlace.atEndOf({
                    parent: this.tree.currentView.root,
                    label: "boxes" as TraitLabel,
                }));
        }
    }

    protected async initializingFromExisting() {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.maybeTree = await this.root.get<IFluidHandle<SharedTree>>("tree")!.get();
    }

    private nodeId() { return Math.random().toString(36).slice(2) as NodeId; }

    // Helper for creating Scalar nodes in SharedTree
    private makeScalar(value: Jsonable) {
        const node: EditNode = {
            identifier: this.nodeId(),
            definition: "scalar" as Definition,
            traits: {},
            payload: { base64: JSON.stringify(value) },
        };

        return node;
    }

    // Helper for making SharedTree subtrees representing boxes
    private makeBox(x: number, y: number, color: string) {
        const node: EditNode = {
            identifier: this.nodeId(),
            definition: "node" as Definition,
            traits: {
                x: [ this.makeScalar(x) ],
                y: [ this.makeScalar(y) ],
                color: [this.makeScalar(color) ],
                width: [this.makeScalar(100)],
                height: [this.makeScalar(100)],
            },
        };

        return node;
    }

    public render(div: HTMLElement) {
        const renderLoop = () => {
            ReactDOM.render(
                <div>
                    <StageView width={stage.width} height={stage.height} bubbles={bubbles}></StageView>
                </div>,
                div);

            requestAnimationFrame(renderLoop);

            for (const bubble of bubbles) {
                moveBubble(stage, bubble);
            }

            for (let i = 0; i < bubbles.length; i++) {
                for (let j = i + 1; j < bubbles.length; j++) {
                    collideBubbles(bubbles[i], bubbles[j]);
                }
            }
        };

        renderLoop();
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    private get tree() { return this.maybeTree!; }
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
