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
    ChangeType,
    Definition,
    EditNode,
    NodeId,
    SetValue,
    SharedTree,
    Snapshot,
    StablePlace,
    TraitLabel,
} from "@fluid-experimental/tree";

import React from "react";
import ReactDOM from "react-dom";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { Jsonable } from "@fluidframework/datastore-definitions";

interface ITreeDemoViewProps {
    model: Snapshot;
}

// Helper for reading scalar values from SharedTree
function readScalar<T>(snapshot: Snapshot, parent: NodeId, label: string) {
    const [nodeId] = snapshot.getTrait({ parent, label: label as TraitLabel });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { base64 } = snapshot.getSnapshotNode(nodeId).payload!;

    return JSON.parse(base64) as T;
}

// Helper for writing scalar vales to SharedTree
function writeScalar(tree: SharedTree, parent: NodeId, label: string, value: Jsonable) {
    const edit: SetValue = {
        nodeToModify: tree.currentView.getTrait({ parent, label: label as TraitLabel })[0],
        payload: { base64: JSON.stringify(value) },
        type: ChangeType.SetValue,
    };
    tree.applyEdit(edit);
}

// Helper for traversing SharedTree nodes
function ref(snapshot: Snapshot, node: NodeId, ...path: (string | number)[]) {
    let children: readonly NodeId[] = [];

    for (const label of path) {
        if (typeof label === "string") {
            children = snapshot.getTrait({ parent: node, label: label as TraitLabel });
        } else {
            // eslint-disable-next-line no-param-reassign
            node = children[label];
        }
    }

    return node;
}

const TreeDemoView: React.FC<ITreeDemoViewProps> = (props: ITreeDemoViewProps) => {
    const boxModels = props.model.getTrait({ parent: props.model.root, label: "boxes" as TraitLabel });
    const boxElements: JSX.Element[] = [];

    for (const boxId of boxModels) {
        const x = readScalar<number>(props.model, boxId, "x");
        const y = readScalar<number>(props.model, boxId, "y");
        const color = readScalar<number>(props.model, boxId, "color");
        const width = readScalar<number>(props.model, boxId, "width");
        const height = readScalar<number>(props.model, boxId, "height");

        boxElements.push(<div
            id={boxId}
            key={boxId}
            style={{
                position: "absolute",
                top: `${y}px`,
                left: `${x}px`,
                background: `${color}`,
                width: `${width}px`,
                height: `${height}px`,
            }}></div>);
    }

    return (
        <div>{boxElements}</div>
    );
};

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

    private readonly doUpdate = () => {
        const boxId = ref(this.tree.currentView, this.tree.currentView.root, "boxes", 0);
        // eslint-disable-next-line no-bitwise
        writeScalar(this.tree, boxId, "y", (Math.random() * 1024) | 0);
    };

    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>
                <button onClick={this.doUpdate}>Click</button>;
                <div style={{ position: "relative" }}>
                    <TreeDemoView model={this.tree.currentView} />
                </div>
            </div>,
            div);
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
