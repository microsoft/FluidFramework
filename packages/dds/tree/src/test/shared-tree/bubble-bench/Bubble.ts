import { ISharedTree } from "../../../shared-tree";
import { Anchor, FieldKey } from "../../../tree";
import { brand } from "../../../util";
import { SharedTreeNodeHelper } from "./SharedTreeNodeHelper";


export class Bubble {
    static xFieldKey: FieldKey = brand('x');
    static yFieldKey: FieldKey = brand('y');
    static vxFieldKey: FieldKey = brand('vx');
    static vyFieldKey: FieldKey = brand('vy');
    static rFieldKey: FieldKey = brand('r');

    private readonly treeHelper: SharedTreeNodeHelper;

    constructor(
        public readonly tree: ISharedTree,
        public readonly anchor: Anchor
    ) {
        this.treeHelper = new SharedTreeNodeHelper(tree, anchor);
     }

    public get x() { return this.treeHelper.getFieldValue(Bubble.xFieldKey) as number; }
    public set x(value: number) { this.treeHelper.editFieldValue(Bubble.xFieldKey, value); }

    public get y() { return this.treeHelper.getFieldValue(Bubble.yFieldKey) as number; }
    public set y(value: number) { this.treeHelper.editFieldValue(Bubble.yFieldKey, value); }

    public get vx() { return this.treeHelper.getFieldValue(Bubble.vxFieldKey) as number; }
    public set vx(value: number) { this.treeHelper.editFieldValue(Bubble.vxFieldKey, value); }

    public get vy() { return this.treeHelper.getFieldValue(Bubble.vyFieldKey) as number; }
    public set vy(value: number) { this.treeHelper.editFieldValue(Bubble.vyFieldKey, value); }

    public get r() { return this.treeHelper.getFieldValue(Bubble.rFieldKey) as number; }
    public set r(value: number) { this.treeHelper.editFieldValue(Bubble.rFieldKey, value); }
}
