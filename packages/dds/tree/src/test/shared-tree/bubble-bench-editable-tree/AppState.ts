/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// import { brand, ISharedTree, JsonableTree, moveToDetachedField } from "@fluid-internal/tree";
// import { TransactionResult } from "../../../checkout";
import { EditableField, IDefaultEditBuilder, singleTextCursor } from "../../../feature-libraries";
// import { moveToDetachedField } from "../../../forest";
// import { ISharedTree } from "../../../shared-tree";
import { FieldKey, JsonableTree } from "../../../tree";
import { brand } from "../../../util";
import { Client } from "./Client";
// import { Client } from "./Client";
import {
    AppStateTreeProxy,
    iBubbleSchema,
    iClientSchema,
    numberSchema,
    stringSchema,
} from "./schema";

export class AppState {
    static clientsFieldKey: FieldKey = brand("clients");

    readonly editBuilderCallbacks: ((editor: IDefaultEditBuilder) => void)[] = [];
    readonly localClient: Client;

    constructor(
        private readonly appStateTreeProxy: AppStateTreeProxy,
        private _width: number,
        private _height: number,
        numBubbles: number,
    ) {
        const clientsSequenceNode = appStateTreeProxy[AppState.clientsFieldKey] as EditableField;
        const clientInitialJsonTree: JsonableTree = this.createClientInitialJsonTree(numBubbles);
        clientsSequenceNode.insertNodes(
            clientsSequenceNode.length,
            singleTextCursor(clientInitialJsonTree),
        );
        this.localClient = new Client(
            appStateTreeProxy.clients[appStateTreeProxy.clients.length - 1],
        );
        console.log(
            `created client with id ${this.localClient.clientId} and color ${this.localClient.color}`,
        );
    }

    // public applyEdits() {
    //     this.tree.runTransaction((forest, editor) => {
    //         this.tree.context.prepareForEdit();
    //         this.editBuilderCallbacks.forEach((editCallback) => editCallback(editor));
    //         return TransactionResult.Apply;
    //     });
    //     this.editBuilderCallbacks.length = 0;
    // }

    createClientInitialJsonTree(numBubbles: number): JsonableTree {
        const clientInitialJsonTree: JsonableTree = {
            type: iClientSchema.name,
            fields: {
                clientId: [{ type: stringSchema.name, value: `${Math.random()}` }],
                color: [{ type: stringSchema.name, value: "red" }],
                bubbles: [],
            },
        };

        // create and add initial bubbles to initial client json tree
        for (let i = 0; i < numBubbles; i++) {
            // const bubble = makeBubble(this._width, this._height);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            clientInitialJsonTree.fields!.bubbles.push({
                type: iBubbleSchema.name,
                fields: {
                    x: [{ type: numberSchema.name, value: 10 }],
                    y: [{ type: numberSchema.name, value: 10 }],
                    r: [{ type: numberSchema.name, value: 10 }],
                    vx: [{ type: numberSchema.name, value: 10 }],
                    vy: [{ type: numberSchema.name, value: 10 }],
                },
            });
        }

        return clientInitialJsonTree;
    }

    public get clients() {
        return [...this.appStateTreeProxy.clients].map(
            (clientTreeProxy) => new Client(clientTreeProxy),
        );
    }

    public get width() {
        return this._width;
    }
    public get height() {
        return this._height;
    }

    public setSize(width?: number, height?: number) {
        this._width = width ?? 640;
        this._height = height ?? 480;
    }

    public increaseBubbles() {
        // console.log("about to increase bubble");
        // this.localClient.increaseBubbles(makeBubble(this._width, this._height));
        this.localClient.increaseBubbles({
            x: 10,
            y: 10,
            vx: 10,
            vy: 10,
            r: 10,
        });
        // console.log("increased bubble");
    }

    public decreaseBubbles() {
        // console.log("about to pop bubble");
        this.localClient.decreaseBubbles();
        // console.log("popped bubble");
    }
}
