import { ISharedTree } from "../../../shared-tree";
import { JsonableTree } from "../../../tree";
import { brand } from "../../../util";
import { Client } from "./Client";
import { iBubbleSchema, iClientSchema, int32Schema, stringSchema } from "./schema";
import { SharedTreeSequenceHelper } from "./SharedTreeSequenceHelper";

export class AppState {
    readonly localClient: Client;
    readonly clientsSequenceHelper: SharedTreeSequenceHelper;
    constructor(
        private readonly tree: ISharedTree,
        private width: number,
        private height: number,
        numBubbles: number,
    ) {
        // Move to root node (which is the Shared AppState Node) and initialize this.clientsSequenceHelper
        const cursor = tree.forest.allocateCursor();
        const destination = tree.forest.root(tree.forest.rootField);
        tree.forest.tryMoveCursorTo(destination, cursor);
        this.clientsSequenceHelper = new SharedTreeSequenceHelper(tree, cursor.buildAnchor(), brand('clients'));

        // Create the initial JsonableTree for the new local client
        const initialClientJsonTree = this.makeClientInitialJsonTree(numBubbles);
        // Insert it the local client the shared tree
        this.clientsSequenceHelper.push(initialClientJsonTree);
        // Keep a reference to the local client inserted into the shared tree
        this.localClient = new Client(tree, this.clientsSequenceHelper.getAnchor(0));
    }

    public get clients() {
        return this.clientsSequenceHelper.getAll().map(treeNode => new Client(this.tree, treeNode.anchor));
    }

    makeClientInitialJsonTree(numBubbles: number) {
        const clientInitialJsonTree: JsonableTree = {
            type: iClientSchema.name,
            fields: {
                clientId: [{ type: stringSchema.name, value: `${Math.random()}` }],
                color: [{ type: stringSchema.name, value: 'red' }], // TODO: repalce with common random color method
                bubbles: [],
            },
        };

        // create and add initial bubbles to initial client json tree
        for (let i = 0; i < numBubbles; i++) {
            const bubble = AppState.makeBubble(this.width, this.height);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            clientInitialJsonTree.fields!.bubbles.push({
                type: iBubbleSchema.name,
                fields: {
                    x: [{ type: int32Schema.name, value: bubble.x }],
                    y: [{ type: int32Schema.name, value: bubble.y }],
                    r: [{ type: int32Schema.name, value: bubble.r }],
                    vx: [{ type: int32Schema.name, value: bubble.vx }],
                    vy: [{ type: int32Schema.name, value: bubble.y }],
                },
            });
        }

        return clientInitialJsonTree;
    }

    public setSize(width?: number, height?: number) {
        this.width = width ?? 640;
        this.height = height ?? 480;
    }

    public increaseBubbles() {
        this.localClient.increaseBubbles(AppState.makeBubble(this.width, this.height));
    }

    public decreaseBubbles() {
        this.localClient.decreaseBubbles();
    }

    // MOCKED METHOD
    // Replace wit actual method from bubble-bench/common when available
    static makeBubble(stageWidth: number, stageHeight: number) {
        return {
            x: 10,
            y: 20,
            r: 30,
            vx: 40,
            vy: 50,
        }
    }

}

// const initialAppStateJsonTree: JsonableTree = {
//     type: bubbleBenchAppStateSchema.name,
//     fields: {
//         clients: [],
//     },
// };


