import { FlowDocument } from "@chaincode/flow-document";
import { Direction, Dom, Scheduler } from "@prague/flow-util";
import { LocalReference } from "@prague/merge-tree";
import { debug, domRangeToString, windowSelectionToString } from "../../debug";
import { DocumentView } from "../document";

export class Cursor {
    public get bounds() {
        const { focusNode, focusOffset } = window.getSelection();
        return focusNode === null
            ? undefined
            : Dom.getClientRect(focusNode, focusOffset);
    }

    public get position() { return this.doc.localRefToPosition(this.endRef); }
    public get selectionStart() { return this.doc.localRefToPosition(this.startRef); }

    public get selection() {
        const start = this.doc.localRefToPosition(this.startRef);
        const end = this.position;

        return { start: Math.min(start, end), end: Math.max(start, end) };
    }

    private get doc() { return this.docView.doc; }
    // tslint:disable:prefer-readonly - TSLint does not recognize assignment via destructuring.
    private startRef: LocalReference;
    private endRef: LocalReference;
    // tslint:enable:prefer-readonly

    private lastDirection = Direction.none;
    private previousBounds: ClientRect;
    private readonly sync: () => void;

    public constructor(private readonly docView: DocumentView, scheduler: Scheduler) {
        this.sync = scheduler.coalesce(scheduler.onPostLayout, () => {
            const end = this.doc.localRefToPosition(this.endRef);
            const maybeView = this.docView.getInclusionView(end);
            if (maybeView) {
                if (maybeView.isFocused) {
                    debug(`  Inclusion already focused.`);
                } else {
                    debug(`  Entering inclusion ${this.lastDirection} ${JSON.stringify(this.previousBounds)}`);
                    maybeView.caretEnter(this.lastDirection, this.previousBounds);
                }
            } else {
                // tslint:disable:prefer-const
                let { node: startNode, nodeOffset: startOffset } = this.docView.positionToNodeOffset(this.doc.localRefToPosition(this.startRef));
                let { node: endNode, nodeOffset: endOffset } = this.docView.positionToNodeOffset(end);
                // tslint:enable:prefer-const

                const selection = window.getSelection();
                const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
                startOffset = this.clampOffset(startNode, startOffset, anchorOffset);
                endOffset = this.clampOffset(endNode, endOffset, focusOffset);
                if (endOffset !== focusOffset || endNode !== focusNode || startOffset !== anchorOffset || startNode !== anchorNode) {
                    debug(`    set: (${domRangeToString(startNode, startOffset, endNode, endOffset)})`);
                    debug(`    was: (${windowSelectionToString()})`);
                    selection.setBaseAndExtent(startNode, startOffset, endNode, endOffset);
                    debug(`    now: (${windowSelectionToString()})`);
                }
            }
        });

        this.startRef = this.doc.addLocalRef(0);
        this.endRef = this.doc.addLocalRef(0);

        this.previousBounds = this.bounds;
        document.addEventListener("selectionchange", this.onSelectionChange);
    }

    public getTracked() {
        return [
            { position: this.position, callback: this.sync },
            { position: this.selectionStart, callback: this.sync },
        ];
    }

    public moveTo(position: number, extendSelection: boolean) {
        debug(`Cursor.moveTo(${position},${extendSelection})`);
        this.setSelection(extendSelection ? this.selectionStart : position, position);
    }

    public moveBy(delta: number, extendSelection: boolean) {
        this.moveTo(this.position + delta, extendSelection);
    }

    public setSelection(start: number, end: number) {
        const { doc } = this;
        debug(`  Cursor.setSelection(${start},${end}):`);
        debug(`    start:`);
        this.startRef = this.updateRef(doc, this.startRef, start);
        debug(`    end:`);
        this.endRef = this.updateRef(doc, this.endRef, end);
        this.sync();
    }

    public setDirection(direction: Direction) {
        this.previousBounds = this.bounds;
        this.lastDirection = direction;
    }

    private updateRef(doc: FlowDocument, ref: LocalReference, position: number) {
        position = Math.min(Math.max(position, 0), doc.length - 1);
        const oldPosition = doc.localRefToPosition(ref);
        if (position === oldPosition) {
            debug(`      ${position} (unchanged)`);
            return ref;
        }

        debug(`      ${position} (was: ${oldPosition})`);
        doc.removeLocalRef(ref);
        return doc.addLocalRef(position);
    }

    private clampOffset(container: Node, offset: number | undefined, defaultOffset: number) {
        const length = container.textContent.length;
        return Math.max(
            0,
            Math.min(
                offset === undefined
                    ? defaultOffset
                    : offset,
                length));
    }

    private readonly onSelectionChange = () => {
        debug(`Cursor.onSelectionChange(${windowSelectionToString()})`);
        const { anchorNode, anchorOffset, focusNode, focusOffset } = window.getSelection();
        const start = this.docView.nodeOffsetToPosition(anchorNode, anchorOffset);
        const end = this.docView.nodeOffsetToPosition(focusNode, focusOffset);
        debug(`  -> ${start}..${end}`);
        this.setSelection(start, end);
    }
}
