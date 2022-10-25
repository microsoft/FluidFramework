import { ISharedTree } from "../../../shared-tree";
import { Anchor, FieldKey } from "../../../tree";
import { brand } from "../../../util";
// import { iBubbleSchema, int32Schema } from "./schema";
// import { Bubble } from "./Bubble";
import { SharedTreeNodeHelper } from "./SharedTreeNodeHelper";
import { SharedTreeSequenceHelper } from "./SharedTreeSequenceHelper";

export class Client {
    static clientIdFieldKey: FieldKey = brand("clientId");
    static colorFieldKey: FieldKey = brand("color");
    static bubblesFieldKey: FieldKey = brand("bubbles");

    private readonly treeHelper: SharedTreeNodeHelper;
    readonly bubbleSeqeunceHelper: SharedTreeSequenceHelper;
    // private readonly _bubbles: Bubble[];

    constructor(
        public readonly tree: ISharedTree,
        public readonly anchor: Anchor,
        private _width: number,
        private _height: number,
    ) {
        this.treeHelper = new SharedTreeNodeHelper(tree, anchor);
        this.bubbleSeqeunceHelper = new SharedTreeSequenceHelper(
            tree,
            anchor,
            Client.bubblesFieldKey,
        );
        // this._bubbles = this.initializeBubblesArray();
    }

    public get clientId() {
        return this.treeHelper.getFieldValue(Client.clientIdFieldKey) as string;
    }
    public set clientId(value: string) {
        this.treeHelper.setFieldValue(Client.clientIdFieldKey, value);
    }

    public get color() {
        return this.treeHelper.getFieldValue(Client.colorFieldKey) as string;
    }
    public set color(value: string) {
        this.treeHelper.setFieldValue(Client.colorFieldKey, value);
    }

    public setSize(width?: number, height?: number) {
        this._width = width ?? 640;
        this._height = height ?? 480;
    }

    // public get bubbles() {
    //     return this._bubbles;
    // }

    private initializeBubblesArray() {
        // const [cursor, bubbleAnchors] = this.bubbleSeqeunceHelper.getAll();
        // const bubbles = bubbleAnchors.map(anchor => new Bubble(this.tree, anchor));
        // cursor.free();
        // return bubbles;
    }

    public increaseBubbles() {
        // // TODO: Replace with makeBubbleMethod using width and height
        // const newBubble = {
        //     type: iBubbleSchema.name,
        //     fields: {
        //         x: [{ type: int32Schema.name, value: 99 }],
        //         y: [{ type: int32Schema.name, value: 99 }],
        //         r: [{ type: int32Schema.name, value: 99 }],
        //         vx: [{ type: int32Schema.name, value: 99 }],
        //         vy: [{ type: int32Schema.name, value: 99 }],
        //     }
        // };
        // this.bubbleSeqeunceHelper.push(newBubble)
        // const newBubs = this.initializeBubblesArray().map(bub => bub.x);
        // const [newBubbleCursor] = this.bubbleSeqeunceHelper.get(this._bubbles.length);
        // this._bubbles.push(new Bubble(this.tree, newBubbleCursor.buildAnchor()));
    }

    public decreaseBubbles() {
        // this.bubbleSeqeunceHelper.pop();
        // this._bubbles.pop();
    }
}
