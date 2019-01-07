import { FlowDocument } from "@chaincode/flow-document";
import { ITrackedPosition } from ".";

export class Paginator {
    public startPosition = 0;

    constructor (private readonly doc: FlowDocument) {}

    private readonly foundLine = (node: Node, nodeOffset: number) => {
    }

    public get startingBlockPosition() {
        // Returns 'undefined' if there is no preceding paragraph marker.
        return this.doc.findParagraphStart(this.startPosition) || 0;
    }

    public get trackedPositions(): ITrackedPosition[] {
        return [{ callback: this.foundLine, position: this.startPosition }];
    }

    public get shouldContinue(): boolean {
        return true;
    }
}