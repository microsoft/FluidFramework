import { ISegment, SegmentGroup } from ".";
import { ListMakeHead } from "./collections";

export class SegmentGroupCollection {
    private readonly segmentGroups = ListMakeHead<SegmentGroup>();

    constructor(private readonly segment: ISegment) {}

    public get size() {
        return this.segmentGroups.count();
    }

    public get empty() {
        return this.segmentGroups.empty();
    }

    public enqueue(segmentGroup: SegmentGroup) {
        this.segmentGroups.enqueue(segmentGroup);
        segmentGroup.segments.push(this.segment);
    }

    public dequeue(): SegmentGroup {
        return this.segmentGroups.dequeue();
    }

    public clear() {
        this.segmentGroups.clear();
    }

    public copyTo(segment: ISegment) {
        this.segmentGroups.walk((sg) => segment.segmentGroups.enqueue(sg));
    }
}
