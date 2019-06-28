import { Dom } from "@prague/flow-util";
import { debug } from "../../debug";
export class Paginator {
    constructor(doc) {
        this.doc = doc;
        this.startPosition = 0;
        this.deltaY = 0;
        this.foundLine = (node, nodeOffset) => {
            debug(`scroll to: "${node.textContent}":${nodeOffset}`);
            const bounds = Dom.getClientRect(node, nodeOffset);
            // 'bounds' can be undefined if the position corresponds to a zero-sized node, such as the
            // <span> inserted to mark EOF.
            if (bounds) {
                this.deltaY = bounds.top;
                debug(`  -> ${this.deltaY}`);
            }
        };
    }
    get startingBlockPosition() {
        // Returns 'undefined' if there is no preceding paragraph marker.
        const startBlockPosition = this.doc.findParagraphStart(this.startPosition);
        return startBlockPosition ? startBlockPosition : 0;
    }
    get trackedPositions() {
        return [{ callback: this.foundLine, position: this.startPosition }];
    }
    get shouldContinue() {
        return true;
    }
}
//# sourceMappingURL=paginator.js.map