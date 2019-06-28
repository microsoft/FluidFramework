import { FlowDocument } from "@chaincode/flow-document";
import { ITrackedPosition } from ".";
export declare class Paginator {
    private readonly doc;
    startPosition: number;
    deltaY: number;
    constructor(doc: FlowDocument);
    private readonly foundLine;
    readonly startingBlockPosition: number;
    readonly trackedPositions: ITrackedPosition[];
    readonly shouldContinue: boolean;
}
//# sourceMappingURL=paginator.d.ts.map