import { FlowDocument } from "@chaincode/flow-document";
import { ITrackedPosition } from ".";
import { Dom } from "@prague/flow-util";

export class Paginator {
    public startPosition = 0;
    public deltaY = 0;

    constructor (private readonly doc: FlowDocument) {}

    private readonly foundLine = (node: Node, nodeOffset: number) => {
        console.log(`scroll to: "${node.textContent}":${nodeOffset}`);
        const bounds = Dom.getClientRect(node, nodeOffset);
        
        // 'bounds' can be undefined if the position corresponds to a zero-sized node, such as the
        // <span> inserted to mark EOF.
        if (bounds) {
            this.deltaY = bounds.top;
            console.log(`  -> ${this.deltaY}`);
        }
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