/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Change, Definition, NodeId, Snapshot, TraitLabel, EditNode } from "@fluid-experimental/tree";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { editScalar, makeScalar, nodeId, readScalar } from "../treeutils";
import { IStage } from "../stage";
import { random, randomColor } from "../rnd";

const enum BubbleTrait {
    x = "x",
    y = "y",
    vx = "vx",
    vy = "vy",
    color = "c",
    radius = "r",
}

export class BubbleProxy {
    private tree!: Snapshot;
    private id!: NodeId;

    public static init(x: number, y: number, r: number, c: string, vx: number, vy: number) {
        const node: EditNode = {
            identifier: nodeId(),
            definition: "node" as Definition,
            traits: {
                x: [ makeScalar(x) ],
                y: [ makeScalar(y) ],
                vx: [ makeScalar(vx) ],
                vy: [ makeScalar(vy) ],
                c: [ makeScalar(c) ],
                r: [ makeScalar(r) ],
            },
        };

        return node;
    }

    public moveTo(tree: Snapshot, id: NodeId) {
        this.tree = tree;
        this.id = id;
    }

    public get x()  { return this.readScalar(BubbleTrait.x) as number; }
    public get y()  { return this.readScalar(BubbleTrait.y) as number; }
    public get vx() { return this.readScalar(BubbleTrait.vx) as number; }
    public get vy() { return this.readScalar(BubbleTrait.vy) as number; }
    public get r()  { return this.readScalar(BubbleTrait.radius) as number; }
    public get c()  { return this.readScalar(BubbleTrait.color) as string; }

    public move({width, height}: IStage, tree: Snapshot) {
        const changes: Change[] = [];

        let x = this.x;
        let y = this.y;
        let vx = this.vx;
        let vy = this.vy;

        x += vx;
        y += vy;

        changes.push(
            this.editScalar(BubbleTrait.x, x),
            this.editScalar(BubbleTrait.y, y),
        );

        // Reflect Bubbles off walls.
        const r = this.r;
        if (vx < 0 && x < r) {
            vx = -vx;
            changes.push(this.editScalar(BubbleTrait.vx, vx));
        }
        else if (vx > 0 && x > (width - r)) {
            vx = -vx;
            changes.push(this.editScalar(BubbleTrait.vx, vx));
        }

        if (vy < 0 && y < r) {
            vy = -vy;
            changes.push(this.editScalar(BubbleTrait.vy, vy));
        }
        else if (vy > 0 && y > (height - r)) {
            vy = -vy;
            changes.push(this.editScalar(BubbleTrait.vy, vy));
        }

        return changes;
    }

    public collide(other: BubbleProxy): readonly Change[] {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        const distance2 = dx * dx + dy * dy;

        const threshold = this.r + other.r;
        const threshold2 = threshold * threshold;

        // Reject bubbles whose centers are too far away to be touching.
        if (distance2 > threshold2) {
            return [];
        }

        const dvx = this.vx - other.vx;
        const dvy = this.vy - other.vy;
        let impulse = dvx * dx + dvy * dy;

        // Reject bubbles that are traveling in the same direction.
        if (impulse > 0) {
            return [];
        }

        impulse /= distance2;

        return [
            this.editScalar(BubbleTrait.vx, this.vx - dx * impulse),
            this.editScalar(BubbleTrait.vy, this.vy - dy * impulse),
            other.editScalar(BubbleTrait.vx, other.vx + dx * impulse),
            other.editScalar(BubbleTrait.vy, other.vy + dy * impulse),
        ];
    }

    private readScalar(trait: BubbleTrait): Jsonable {
        return readScalar(this.tree, this.id, trait as TraitLabel);
    }

    private editScalar(trait: BubbleTrait, value: Jsonable): Change {
        return editScalar(this.tree, this.id, trait as TraitLabel, value);
    }
}

export function makeBubble(
    { width, height }: IStage,
    radius: number,
    maxSpeed: number,
): EditNode {
    const diameter = radius * 2;

    return BubbleProxy.init(
        /* x: */ radius + (width - diameter) * random.float64(),
        /* y: */ radius + (height - diameter) * random.float64(),
        /* r: */ radius,
        /* c: */ randomColor(),
        /* vx: */ maxSpeed * (random.float64() * 2 - 1),
        /* vy: */ maxSpeed * (random.float64() * 2 - 1),
    );
}
