import { FlowDocument } from "@chaincode/flow-document";
import { Dom, Scheduler, Template } from "@prague/flow-util";
import { LocalReference } from "@prague/merge-tree";
import { debug } from "../../debug";
import * as styles from "./index.css";

const template = new Template({
    tag: "span",
    props: { className: styles.cursorOverlay },
    children: [
        { tag: "span", ref: "highlights", props: { className: styles.cursorHighlightRoot }},
        { tag: "span", ref: "cursor", props: { className: styles.cursor }},
    ],
});

export class Cursor {
    public get position() { return this.doc.localRefToPosition(this.endRef); }

    public get selection() {
        const start = this.doc.localRefToPosition(this.startRef);
        const end = this.position;

        return { start: Math.min(start, end), end: Math.max(start, end) };
    }

    public get bounds() { return this.cursorBounds; }

    public readonly root: HTMLElement;
    private startRef: LocalReference;
    private endRef: LocalReference;

    private startContainer?: Node;
    private relativeStartOffset = NaN;

    private endContainer?: Node;
    private relativeEndOffset = NaN;
    private cursorBounds?: ClientRect;

    private readonly domRange = document.createRange();
    private readonly cursorElement: HTMLElement;
    private readonly sync: () => void;

    constructor(private readonly doc: FlowDocument, scheduler: Scheduler) {
        this.sync = scheduler.coalesce(scheduler.onLayout, () => {
            this.updateCursor();
            this.updateSelection();
            this.restartBlinkAnimation();
        });

        this.root = template.clone() as HTMLElement;
        this.cursorElement = template.get(this.root, "cursor") as HTMLElement;

        this.startRef = doc.addLocalRef(0);
        this.endRef = doc.addLocalRef(0);
    }

    public moveTo(position: number, extendSelection: boolean) {
        this.setPosition(position);
        if (!extendSelection) {
            this.setSelectionStart(position);
        }
    }

    public moveBy(delta: number, extendSelection: boolean) {
        this.moveTo(this.position + delta, extendSelection);
    }

    public getTracked() {
        return [
            { position: this.position, callback: this.updateDomRangeEnd },
            { position: this.selectionStart, callback: this.updateDomRangeStart },
        ];
    }

    public show() {
        debug("show cursor");
        this.root.style.visibility = "inherit";
    }

    public hide() {
        debug("hide cursor");
        this.root.style.visibility = "hidden";
    }

    public readonly render = () => {
        return this.root;
    }

    private get selectionStart() { return this.doc.localRefToPosition(this.startRef); }

    private clampPosition(position: number) {
        return Math.min(Math.max(position, 0), this.doc.length - 1);
    }

    private addLocalRef(position: number) {
        return this.doc.addLocalRef(this.clampPosition(position));
    }

    private setSelectionStart(newStart: number) {
        this.doc.removeLocalRef(this.startRef);
        this.startRef = this.addLocalRef(newStart);
    }

    private setPosition(newEnd: number) {
        this.doc.removeLocalRef(this.endRef);
        this.endRef = this.addLocalRef(newEnd);
    }

    private clampToText(container: Node, position: number) {
        return Math.max(0, Math.min(position, container.textContent!.length));
    }

    private setRangeStart(container: Node, position: number) {
        this.domRange.setStart(container, this.clampToText(container, position));
    }

    private setRangeEnd(container: Node, position: number) {
        this.domRange.setEnd(container, this.clampToText(container, position));
    }

    /**
     * Returns the top/left offset of nearest ancestor that is a CSS containing block, used to
     * adjust absolute the x/y position of the caret/highlight.
     */
    private getOffset(): { top: number, left: number } {
        // Note: Could generalize by walking parentElement chain and probing style properties.
        return this.root.offsetParent!.getBoundingClientRect();
    }

    private readonly updateDomRangeStart = (node: Node, nodeOffset: number) => {
        this.startContainer = node;
        this.relativeStartOffset = nodeOffset;
        this.sync();
    }

    private readonly updateDomRangeEnd = (node: Node, nodeOffset: number) => {
        this.endContainer = node;
        this.relativeEndOffset = nodeOffset;
        this.sync();
    }

    private updateSelection() {
        if (!this.startContainer || !this.endContainer) {
            throw new Error();
        }

        if (this.position > this.selectionStart) {
            this.setRangeStart(this.startContainer, this.relativeStartOffset);
            this.setRangeEnd(this.endContainer, this.relativeEndOffset);
        } else {
            this.setRangeEnd(this.startContainer, this.relativeStartOffset);
            this.setRangeStart(this.endContainer, this.relativeEndOffset);
        }

        const selection = window.getSelection();
        if (selection.rangeCount !== 1 || selection.getRangeAt(0) !== this.domRange) {
            selection.removeAllRanges();
            selection.addRange(this.domRange);
        }

        debug(`Updated Selection: ${this.domRange.startContainer.textContent}:${this.domRange.startOffset}..${this.domRange.endContainer.textContent}:${this.domRange.endOffset}`);
    }

    private getCursorBounds() {
        // tslint:disable-next-line:binary-expression-operand-order
        if (!(this.endContainer && 0 <= this.relativeEndOffset && this.relativeEndOffset < +Infinity)) {
            return undefined;
        }

        return Dom.getClientRect(this.endContainer, this.relativeEndOffset);
    }

    private updateCursor() {
        // If the cursor position is currently within the windowed of rendered elements, display it at the
        // appropriate location.
        this.cursorBounds = this.getCursorBounds();
        if (this.cursorBounds) {
            const offset = this.getOffset();
            debug(`cursor: (${this.cursorBounds.top} - ${offset.top} -> ${this.cursorBounds.top - offset.top},`);
            debug(`        (${this.cursorBounds.left} - ${offset.left} -> ${this.cursorBounds.left - offset.left},`);
            this.cursorElement.style.visibility = "inherit";
            this.cursorElement.style.top = `${this.cursorBounds.top - offset.top}px`;
            this.cursorElement.style.left = `${this.cursorBounds.left - offset.left}px`;
            this.cursorElement.style.height = `${this.cursorBounds.height}px`;
        } else {
            this.hide();
        }
    }

    private restartBlinkAnimation() {
        // To restart the CSS blink animation, we swap the position of the cursor element with it's sibling.
        // (See: https://css-tricks.com/restart-css-animation/).
        if (this.cursorElement.parentNode) {
            this.cursorElement.parentNode.insertBefore(this.cursorElement, this.cursorElement.previousSibling);
        }
    }
}
