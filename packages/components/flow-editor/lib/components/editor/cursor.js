import { Dom, Template } from "@prague/flow-util";
import { debug } from "../../debug";
import * as styles from "./index.css";
const template = new Template({
    tag: "span",
    props: { className: styles.cursorOverlay },
    children: [
        { tag: "span", ref: "highlights", props: { className: styles.cursorHighlightRoot } },
        { tag: "span", ref: "cursor", props: { className: styles.cursor } },
    ],
});
export class Cursor {
    constructor(doc) {
        this.doc = doc;
        this.relativeStartOffset = NaN;
        this.relativeEndOffset = NaN;
        this.domRange = document.createRange();
        this.render = () => {
            return this.root;
        };
        this.updateDomRangeStart = (node, nodeOffset) => {
            this.startContainer = node;
            this.relativeStartOffset = nodeOffset;
        };
        this.updateDomRangeEnd = (node, nodeOffset) => {
            this.endContainer = node;
            this.relativeEndOffset = nodeOffset;
            this.updateCursor();
            this.updateSelection();
            this.restartBlinkAnimation();
        };
        this.root = template.clone();
        this.highlightRootElement = template.get(this.root, "highlights");
        this.cursorElement = template.get(this.root, "cursor");
        this.startRef = doc.addLocalRef(0);
        this.endRef = doc.addLocalRef(0);
    }
    get selectionStart() { return this.doc.localRefToPosition(this.startRef); }
    get position() { return this.doc.localRefToPosition(this.endRef); }
    get bounds() { return this.cursorBounds; }
    moveTo(position, extendSelection) {
        this.setPosition(position);
        if (!extendSelection) {
            this.setSelectionStart(position);
        }
    }
    moveBy(delta, extendSelection) {
        this.moveTo(this.position + delta, extendSelection);
    }
    getTracked() {
        return [
            { position: this.position, callback: this.updateDomRangeEnd },
            { position: this.selectionStart, callback: this.updateDomRangeStart },
        ];
    }
    show() {
        debug("show cursor");
        this.root.style.visibility = "inherit";
    }
    hide() {
        debug("hide cursor");
        this.root.style.visibility = "hidden";
    }
    clampPosition(position) {
        return Math.min(Math.max(position, 0), this.doc.length - 1);
    }
    addLocalRef(position) {
        return this.doc.addLocalRef(this.clampPosition(position));
    }
    setSelectionStart(newStart) {
        this.doc.removeLocalRef(this.startRef);
        this.startRef = this.addLocalRef(newStart);
    }
    setPosition(newEnd) {
        this.doc.removeLocalRef(this.endRef);
        this.endRef = this.addLocalRef(newEnd);
    }
    clampToText(container, position) {
        return Math.max(0, Math.min(position, container.textContent.length));
    }
    setRangeStart(container, position) {
        this.domRange.setStart(container, this.clampToText(container, position));
    }
    setRangeEnd(container, position) {
        this.domRange.setEnd(container, this.clampToText(container, position));
    }
    /**
     * Returns the top/left offset of nearest ancestor that is a CSS containing block, used to
     * adjust absolute the x/y position of the caret/highlight.
     */
    getOffset() {
        // Note: Could generalize by walking parentElement chain and probing style properties.
        return this.root.offsetParent.getBoundingClientRect();
    }
    updateSelection() {
        // tslint:disable-next-line:no-inner-html
        this.highlightRootElement.innerHTML = "";
        if (!this.startContainer || !this.endContainer) {
            throw new Error();
        }
        if (this.position > this.selectionStart) {
            this.setRangeStart(this.startContainer, this.relativeStartOffset);
            this.setRangeEnd(this.endContainer, this.relativeEndOffset);
        }
        else {
            this.setRangeEnd(this.startContainer, this.relativeStartOffset);
            this.setRangeStart(this.endContainer, this.relativeEndOffset);
        }
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(this.domRange);
        // const offset = this.getOffset();
        // for (const rect of this.domRange.getClientRects()) {
        //     debug(`highlight: ${JSON.stringify(rect)}`);
        //     const div = e({ tag: "div", props: { className: styles.highlightRect }});
        //     div.style.top = `${rect.top - offset.top}px`;
        //     div.style.left = `${rect.left - offset.left}px`;
        //     div.style.width = `${rect.width}px`;
        //     div.style.height = `${rect.height}px`;
        //     this.highlightRootElement.appendChild(div);
        // }
    }
    getCursorBounds() {
        if ((!this.endContainer)
            || (this.relativeEndOffset < 0 || +Infinity < this.relativeEndOffset)) {
            return undefined;
        }
        return Dom.getClientRect(this.endContainer, this.relativeEndOffset);
    }
    updateCursor() {
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
        }
        else {
            // Otherwise hide it.
            this.cursorElement.style.visibility = "hidden";
        }
    }
    restartBlinkAnimation() {
        // To restart the CSS blink animation, we reinsert the element it at it's current location.
        // (See: https://css-tricks.com/restart-css-animation/).
        if (this.cursorElement.parentNode) {
            this.cursorElement.parentNode.insertBefore(this.cursorElement, this.cursorElement.previousSibling);
        }
    }
}
//# sourceMappingURL=cursor.js.map