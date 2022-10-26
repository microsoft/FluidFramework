import { ISharedTree } from "../../../shared-tree";
import { Anchor, FieldKey } from "../../../tree";
import { brand } from "../../../util";
import { Bubble } from "./Bubble";
import { iBubbleSchema, int32Schema } from "./schema";
import { SharedTreeNodeHelper } from "./SharedTreeNodeHelper";
import { SharedTreeSequenceHelper } from "./SharedTreeSequenceHelper";

export class Client {
    static clientIdFieldKey: FieldKey = brand("clientId");
    static colorFieldKey: FieldKey = brand("color");
    static bubblesFieldKey: FieldKey = brand("bubbles");

    private readonly treeHelper: SharedTreeNodeHelper;
    readonly bubbleSeqeunceHelper: SharedTreeSequenceHelper;
    private readonly _bubbles: Bubble[];

    constructor(
        public readonly tree: ISharedTree,
        public readonly anchor: Anchor,
    ) {
        this.treeHelper = new SharedTreeNodeHelper(tree, anchor);
        this.bubbleSeqeunceHelper = new SharedTreeSequenceHelper(
            tree,
            anchor,
            Client.bubblesFieldKey,
        );

        this._bubbles = this.bubbleSeqeunceHelper
            .getAllAnchors()
            .map((bubbleAnchor) => new Bubble(this.tree, bubbleAnchor));
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

    public get bubbles() {
        return this._bubbles;
    }

    public increaseBubbles(bubble: {
        x: number;
        y: number;
        r: number;
        vx: number;
        vy: number;
    }) {
        // TODO: Replace with makeBubble method with actual one from common when available
        const newBubbleJsonableTree = {
            type: iBubbleSchema.name,
            fields: {
                x: [{ type: int32Schema.name, value: bubble.x }],
                y: [{ type: int32Schema.name, value: bubble.y }],
                r: [{ type: int32Schema.name, value: bubble.r }],
                vx: [{ type: int32Schema.name, value: bubble.vx }],
                vy: [{ type: int32Schema.name, value: bubble.y }],
            },
        };
        this.bubbleSeqeunceHelper.push(newBubbleJsonableTree);
        this._bubbles.push(
            new Bubble(this.tree, this.bubbleSeqeunceHelper.getAnchor(this._bubbles.length)),
        );
    }

    public decreaseBubbles() {
        if (this._bubbles.length > 1) {
            this.bubbleSeqeunceHelper.pop();
            this._bubbles.pop();
        }
    }
}
