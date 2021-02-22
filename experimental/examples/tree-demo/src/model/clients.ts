/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Definition, NodeId, Snapshot, TraitLabel, EditNode, SharedTree, StablePlace } from "@fluid-experimental/tree";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { IAudience } from "@fluidframework/container-definitions";
import { editScalar, makeScalar, nodeId, readScalar } from "../treeutils";
import { randomColor } from "../rnd";
import { BubbleProxy } from "./bubble";

const enum ClientTrait {
    clientId = "i",
    color = "c",
    bubbles = "b",
}

export class ClientProxy {
    private tree!: Snapshot;
    private id!: NodeId;

    public static init(clientId: string, color: string, bubbles: EditNode[]) {
        const node: EditNode = {
            identifier: nodeId(),
            definition: "node" as Definition,
            traits: {
                [ClientTrait.clientId]: [ makeScalar(clientId) ],
                [ClientTrait.color]: [ makeScalar(color) ],
                [ClientTrait.bubbles]: bubbles,
            },
        };

        return node;
    }

    public moveTo(tree: Snapshot, id: NodeId) {
        this.tree = tree;
        this.id = id;
    }

    public get clientId() { return this.readScalar(ClientTrait.clientId) as string; }
    public get color() { return this.readScalar(ClientTrait.color) as string; }

    public get bubbles() {
        return this.tree.getTrait({ parent: this.id, label: ClientTrait.bubbles as TraitLabel });
    }

    public setClientId(value: string) {
        return editScalar(this.tree, this.id, ClientTrait.clientId as TraitLabel, value);
    }

    private readScalar(trait: ClientTrait): Jsonable {
        return readScalar(this.tree, this.id, trait as TraitLabel);
    }

    public addBubble(tree: SharedTree, bubble: EditNode) {
        tree.editor.insert(
            bubble,
            StablePlace.atEndOf(
                { parent: this.id, label: ClientTrait.bubbles as TraitLabel },
            ));
    }

    public removeBubble(tree: SharedTree) {
        const bubbles = this.bubbles;
        if (bubbles.length > 0) {
            tree.editor.delete(tree.currentView.getChangeNode(bubbles[bubbles.length - 1]));
        }
    }
}

export class ClientManager {
    private readonly clientProxy = new ClientProxy();
    private readonly bubbleProxy = new BubbleProxy();
    private readonly myClientNodeId: NodeId;

    constructor(
        private readonly tree: SharedTree,
        bubbles: EditNode[],
        private readonly audience: IAudience,
    ) {
        const clientNode = ClientProxy.init("pending", randomColor(), bubbles);
        this.myClientNodeId = clientNode.identifier;

        this.tree.editor.insert(
            clientNode,
            StablePlace.atEndOf({
                parent: tree.currentView.root,
                label: "clients" as TraitLabel,
            }));
    }

    public getClientId(tree: Snapshot) {
        this.clientProxy.moveTo(tree, this.myClientNodeId);
        return this.clientProxy.clientId;
    }

    public setClientId(tree: SharedTree, clientId: string) {
        this.clientProxy.moveTo(tree.currentView, this.myClientNodeId);
        tree.applyEdit(this.clientProxy.setClientId(clientId));
    }

    public forEachClient(view: Snapshot, callback: (client: ClientProxy, local: boolean, nodeId: NodeId) => void) {
        const members = this.audience.getMembers();
        const clients = view.getTrait({ parent: view.root, label: "clients" as TraitLabel });

        for (const clientNodeId of clients) {
            this.clientProxy.moveTo(view, clientNodeId);
            if (clientNodeId === this.myClientNodeId) {
                callback(this.clientProxy, /* local: */ true, clientNodeId);
            } else if (members.has(this.clientProxy.clientId)) {
                callback(this.clientProxy, /* local: */ false, clientNodeId);
            } else {
                console.log(`Skipped: ${this.clientProxy.clientId}`);
            }
        }
    }

    public localBubbles(view: Snapshot): readonly NodeId[] {
        this.clientProxy.moveTo(view, this.myClientNodeId);
        return this.clientProxy.bubbles;
    }

    public forEachRemoteBubble(view: Snapshot, callback: (bubble: BubbleProxy) => void) {
        this.forEachClient(view, (client, local) => {
            if (!local) {
                for (const bubbleId of client.bubbles) {
                    this.bubbleProxy.moveTo(view, bubbleId);
                    callback(this.bubbleProxy);
                }
            }
        });
    }

    public addBubble(tree: SharedTree, bubble: EditNode) {
        this.clientProxy.moveTo(tree.currentView, this.myClientNodeId);
        this.clientProxy.addBubble(tree, bubble);
    }

    public removeBubble(tree: SharedTree) {
        this.clientProxy.moveTo(tree.currentView, this.myClientNodeId);
        this.clientProxy.removeBubble(tree);
    }
}
