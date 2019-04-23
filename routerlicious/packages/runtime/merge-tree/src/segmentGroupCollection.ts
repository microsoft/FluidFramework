import { ISegment, List, ListMakeHead, SegmentGroup } from ".";

export class SegmentGroupCollection {
    private readonly segmentGroups: List<SegmentGroup> = ListMakeHead<SegmentGroup>();

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
        // tslint:disable-next-line:no-unsafe-any
        return this.segmentGroups.dequeue();
    }

    public clear() {
        this.segmentGroups.clear();
    }

    public copyTo(segment: ISegment) {
        this.segmentGroups.walk((sg) => segment.segmentGroups.enqueue(sg));
    }
}
