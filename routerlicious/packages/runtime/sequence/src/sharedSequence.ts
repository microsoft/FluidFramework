import {
    BaseSegment,
    IJSONSegment,
    ISegment,
    LocalClientId,
    PropertySet,
    SegmentType,
    UniversalSequenceNumber,
} from "@prague/merge-tree";
import { IDistributedObjectServices, IRuntime } from "@prague/runtime-definitions";
import { SharedSegmentSequence } from "./sequence";

const MaxRun = 128;

export interface IJSONRunSegment<T> extends IJSONSegment {
    items: T[];
}

export class SubSequence<T> extends BaseSegment {

    public static fromJSONObject(spec: any) {
        // tslint:disable: no-unsafe-any
        if (spec && typeof spec === "object" && "items" in spec) {
            const segment = new SubSequence(spec.items, UniversalSequenceNumber, LocalClientId);
            if (spec.props) {
                segment.addProperties(spec.props);
            }
            return segment;
        }
        return undefined;
    }

    constructor(public items: T[], seq?: number, clientId?: number) {
        super(seq, clientId);
        this.cachedLength = items.length;
    }

    public toJSONObject() {
        const obj: IJSONRunSegment<T> = { items: this.items };
        super.addSerializedProps(obj);
        return obj;
    }

    public clone(start = 0, end?: number) {
        let clonedItems = this.items;
        if (end === undefined) {
            clonedItems = clonedItems.slice(start);
        } else {
            clonedItems = clonedItems.slice(start, end);
        }
        const b = new SubSequence(clonedItems, this.seq, this.clientId);
        this.cloneInto(b);
        return b;
    }

    public getType() {
        return SegmentType.Run;
    }

    public canAppend(segment: ISegment) {
        return segment.getType() === SegmentType.Run
            && (this.cachedLength <= MaxRun || segment.cachedLength <= MaxRun);
    }

    public toString() {
        return this.items.toString();
    }

    public append(segment: ISegment) {
        if (segment.getType() !== SegmentType.Run) {
            throw new Error("can only append another run segment");
        }

        // Note: Must call 'appendLocalRefs' before modifying this segment's length as
        //       'this.cachedLength' is used to adjust the offsets of the local refs.
        this.appendLocalRefs(segment);

        const rseg = segment as SubSequence<T>;
        this.items = this.items.concat(rseg.items);
        this.cachedLength = this.items.length;
    }

    // TODO: retain removed items for undo
    // returns true if entire run removed
    public removeRange(start: number, end: number) {
        let remnantItems = [] as T[];
        const len = this.items.length;
        if (start > 0) {
            remnantItems = remnantItems.concat(this.items.slice(0, start));
        }
        if (end < len) {
            remnantItems = remnantItems.concat(this.items.slice(end));
        }
        this.items = remnantItems;
        this.cachedLength = this.items.length;
        return (this.items.length === 0);
    }

    protected createSplitSegmentAt(pos: number) {
        if (pos > 0) {
            const remainingItems = this.items.slice(pos);
            this.items = this.items.slice(0, pos);
            this.cachedLength = this.items.length;
            const leafSegment = new SubSequence(remainingItems, this.seq, this.clientId);
            return leafSegment;
        }
    }

}

export class SharedSequence<T> extends SharedSegmentSequence<SubSequence<T>> {
    constructor(
        document: IRuntime,
        public id: string,
        extensionType: string,
        services?: IDistributedObjectServices) {
        super(document, id, extensionType, services);
    }

    /**
     * @param pos - The position to insert the items at.
     * @param items - The items to insert.
     * @param props - Optional. Properties to set on the inserted items.
     */
    public insert(pos: number, items: T[], props?: PropertySet) {

        const segment = new SubSequence<T>(items);
        if (props) {
            segment.addProperties(props);
        }
        const insertOp = this.client.insertSegmentLocal(pos, segment);
        if (insertOp) {
            this.submitIfAttached(insertOp);
        }
    }

    /**
     * @param start - The inclusive start of the range to remove
     * @param end - The exclusive end of the range to remove
     */
    public remove(start: number, end: number) {
        this.removeRange(start, end);
    }

    /**
     * Returns the total count of items in the sequence
     */
    public getItemCount(): number {
        return this.getLength();
    }

    /**
     * Gets the items in the specified range
     *
     * @param start - The inclusive start of the range
     * @param end - The exclusive end of the range
     */
    public getItems(start: number, end?: number): T[] {
        const items: T[] = [];

        this.client.walkSegments(
            start,
            end,
            (segment: ISegment) => {
                if (segment instanceof SubSequence) {
                    items.push(...segment.items);
                }
            });

        return items;
    }

    protected segmentFromSpec(segSpec: IJSONRunSegment<T>) {
        const seg = new SubSequence<T>(segSpec.items);
        if (segSpec.props) {
            seg.addProperties(segSpec.props);
        }
        return seg;
    }
}
