import { LocalReference } from "@prague/merge-tree";
import { Template, Dom } from "@prague/flow-util";
import * as styles from "./editor.css";
import { FlowDocument } from "@chaincode/flow-document";

const template = new Template({
    tag: "span",
    props: { className: styles.cursorOverlay },
    children: [
        { tag: "span", ref: "highlights", props: { className: styles.cursorHighlightRoot }},
        { tag: "span", ref: "cursor", props: { className: styles.cursor }}
    ]
});

export class Cursor {
    private startRef: LocalReference;
    private endRef: LocalReference;

    private startContainer?: Node;
    private relativeStartOffset = NaN;

    private endContainer?: Node;
    private relativeEndOffset = NaN;
    private cursorBounds?: ClientRect = undefined;

    private readonly domRange = document.createRange();
    
    public readonly root: HTMLElement;
    private readonly highlightRootElement: Element;
    private readonly cursorElement: HTMLElement;

    constructor (private readonly doc: FlowDocument) {
        this.root = template.clone() as HTMLElement;
        this.highlightRootElement = template.get(this.root, "highlights");
        this.cursorElement = template.get(this.root, "cursor") as HTMLElement;

        this.startRef = doc.addLocalRef(0);
        this.endRef = doc.addLocalRef(0);
    }

    private clampPosition(position: number) {
        return Math.min(Math.max(position, 0), this.doc.length - 1);
    }

    private addLocalRef(position: number) {
        return this.doc.addLocalRef(this.clampPosition(position));
    }

    public get selectionStart() { return this.doc.localRefToPosition(this.startRef); }
    private setSelectionStart(newStart: number) { 
        this.doc.removeLocalRef(this.startRef);
        this.startRef = this.addLocalRef(newStart);
    }

    public get position() { return this.doc.localRefToPosition(this.endRef); }
    private setPosition(newEnd: number) {
        this.doc.removeLocalRef(this.endRef);
        this.endRef = this.addLocalRef(newEnd);
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
            { position: this.selectionStart, callback: this.updateDomRangeStart },
            { position: this.position, callback: this.updateDomRangeEnd },
        ];
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

    private updateSelection() {
        this.highlightRootElement.innerHTML = "";

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
        selection.removeAllRanges();
        selection.addRange(this.domRange);

        // const offset = this.getOffset();
        // for (const rect of this.domRange.getClientRects()) {
        //     console.log(`highlight: ${JSON.stringify(rect)}`);
        //     const div = e({ tag: "div", props: { className: styles.highlightRect }});

        //     div.style.top = `${rect.top - offset.top}px`;
        //     div.style.left = `${rect.left - offset.left}px`;
        //     div.style.width = `${rect.width}px`;
        //     div.style.height = `${rect.height}px`;

        //     this.highlightRootElement.appendChild(div);
        // }
    }

    private getCursorBounds() {       
        if ((!this.endContainer)
            || (this.relativeEndOffset < 0 || +Infinity < this.relativeEndOffset)
        ) {
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
            console.log(`cursor: (${this.cursorBounds.top} - ${offset.top} -> ${this.cursorBounds.top - offset.top},`);
            console.log(`        (${this.cursorBounds.left} - ${offset.left} -> ${this.cursorBounds.left - offset.left},`);
            this.cursorElement.style.visibility = "inherit";
            this.cursorElement.style.top = `${this.cursorBounds.top - offset.top}px`;
            this.cursorElement.style.left = `${this.cursorBounds.left - offset.left}px`;
            this.cursorElement.style.height = `${this.cursorBounds.height}px`;
        } else {
            // Otherwise hide it.
            this.cursorElement.style.visibility = "hidden";
        }
    }

    public show() {
        console.log("show cursor"); 
        this.root.style.visibility = "inherit";
    }
    
    public hide() { 
        console.log("hide cursor"); 
        this.root.style.visibility = "hidden";
    }

    private readonly updateDomRangeStart = (node: Node, nodeOffset: number) => {
        this.startContainer = node;
        this.relativeStartOffset = nodeOffset;
    }

    private readonly updateDomRangeEnd = (node: Node, nodeOffset: number) => {
        this.endContainer = node;
        this.relativeEndOffset = nodeOffset;

        requestAnimationFrame(() => {
            this.updateCursor();
            this.updateSelection();
            this.restartBlinkAnimation();
        });
    }

    private restartBlinkAnimation() {
        // To restart the CSS blink animation, we reinsert the element it at it's current location.
        // (See: https://css-tricks.com/restart-css-animation/).
        if (this.cursorElement.parentNode) {
            this.cursorElement.parentNode.insertBefore(this.cursorElement, this.cursorElement.previousSibling);
        }
    }

    public get bounds() { return this.cursorBounds; }
    
    public readonly render = () => { 
        return this.root;
    }
}