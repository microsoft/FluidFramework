// tslint:disable:align whitespace no-trailing-whitespace
import * as API from "../../api";
import * as SharedString from "../../merge-tree";
import * as Geometry from "./geometry";

enum CharacterCodes {
    _ = 95,
    $ = 36,

    ampersand = 38,             // &
    asterisk = 42,              // *
    at = 64,                    // @
    backslash = 92,             // \
    bar = 124,                  // |
    caret = 94,                 // ^
    closeBrace = 125,           // }
    closeBracket = 93,          // ]
    closeParen = 41,            // )
    colon = 58,                 // : 
    comma = 44,                 // ,
    dot = 46,                   // .
    doubleQuote = 34,           // "
    equals = 61,                // =
    exclamation = 33,           // !
    hash = 35,                  // #
    greaterThan = 62,           // >
    lessThan = 60,              // <
    minus = 45,                 // -
    openBrace = 123,            // {
    openBracket = 91,           // [
    openParen = 40,             // (
    percent = 37,               // %
    plus = 43,                  // +
    question = 63,              // ?
    semicolon = 59,             // ;
    singleQuote = 39,           // '
    slash = 47,                 // /
    tilde = 126,                // ~
    linefeed = 10,              // \n
    cr = 13,                    // \r
    _0 = 48,
    _9 = 57,
    a = 97,
    z = 122,

    A = 65,
    Z = 90,
    space = 0x0020,   // " "
}

interface ISegSpan extends HTMLSpanElement {
    seg: SharedString.TextSegment;
    segPos?: number;
    offset?: number;
    clipOffset?: number;
}

interface IRangeInfo {
    elm: HTMLElement;
    node: Node;
    offset: number;
}

function elmOffToSegOff(elmOff: IRangeInfo, span: HTMLSpanElement) {
    if ((elmOff.elm !== span) && (elmOff.elm.parentElement !== span)) {
        console.log("did not hit span");
    }
    let offset = elmOff.offset;
    let prevSib = elmOff.node.previousSibling;
    if ((!prevSib) && (elmOff.elm !== span)) {
        prevSib = elmOff.elm.previousSibling;
    }
    while (prevSib) {
        switch (prevSib.nodeType) {
            case Node.ELEMENT_NODE:
                let innerSpan = <HTMLSpanElement>prevSib;
                offset += innerSpan.innerText.length;
                break;
            case Node.TEXT_NODE:
                offset += prevSib.nodeValue.length;
                break;
            default:
                break;
        }
        prevSib = prevSib.previousSibling;
    }
    return offset;
}

let cachedCanvas: HTMLCanvasElement;
function getTextWidth(text, font) {
    // re-use canvas object for better performance
    const canvas = cachedCanvas || (cachedCanvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    context.font = font;
    const metrics = context.measureText(text);
    return metrics.width;
}

function makeInnerDiv() {
    let innerDiv = document.createElement("div");
    innerDiv.style.font = "18px Times";
    innerDiv.style.lineHeight = "125%";
    innerDiv.onclick = (e) => {
        let div = <HTMLDivElement>e.target;
        if (div.lastElementChild) {
            // tslint:disable-next-line:max-line-length
            console.log(`div click at ${e.clientX},${e.clientY} rightmost span with text ${div.lastElementChild.innerHTML}`);
        }
    };
    return innerDiv;
}

function makeScrollLosenge(height: number, left: number, top: number) {
    let div = document.createElement("div");
    div.style.width = "12px";
    div.style.height = `${height}px`;
    div.style.left = `${left}px`;
    div.style.top = `${top}px`;
    div.style.backgroundColor = "pink";
    let bordRad = height / 3;
    div.style.borderRadius = `${bordRad}px`;
    div.style.position = "absolute";
    return div;
}

function renderTree(div: HTMLDivElement, pos: number, client: SharedString.Client, context: FlowView) {
    div.id = "renderedTree";
    div.style.whiteSpace = "pre-wrap";
    let splitTopSeg = true;
    let w = Math.floor(context.wEst);
    let h = context.hEst;
    let bounds = div.getBoundingClientRect();
    let charsPerLine = bounds.width / w;
    let charsPerViewport = Math.floor((bounds.height / h) * charsPerLine);
    let innerDiv = makeInnerDiv();
    div.appendChild(innerDiv);
    let charLength = 0;
    let firstSeg = true;
    let firstDiv = innerDiv;
    let cursorRendered = false;
    context.viewportEndChar = -1;

    function findLastChar() {
        if (div.children.length > 0) {
            let child = div.lastElementChild;
            if (child.children.length === 0) {
                child = child.previousElementSibling;
            }
            if (child) {
                let lastSpan = <ISegSpan>child.lastElementChild;
                if (lastSpan) {
                    if (lastSpan.clipOffset) {
                        return lastSpan.clipOffset;
                    } else {
                        return lastSpan.segPos + lastSpan.innerText.length - 1;
                    }
                }
            }
        }
        return -1;
    }

    function renderSegment(segment: SharedString.Segment, segPos: number, refSeq: number,
        clientId: number, start: number, end: number) {
        let segOffset = 0;

        function makeSegSpan(segText: string, textSegment: SharedString.TextSegment, offset: number,
            startChar: number, clipChar?: number) {
            let span = <ISegSpan>document.createElement("span");
            span.innerText = segText;
            span.seg = textSegment;
            span.segPos = startChar;
            if (textSegment.properties) {
                for (let key in textSegment.properties) {
                    if (textSegment.properties.hasOwnProperty(key)) {
                        span.style[key] = textSegment.properties[key];
                    }
                }
            }
            if (offset > 0) {
                span.offset = offset;
            }
            return span;
        }

        function segmentToSpan(segText: string, textSegment: SharedString.TextSegment, offset: number,
            startChar: number, renderCursor: boolean, clipChar?: number) {
            let startPos = startChar + offset;
            let endPos = startPos + segText.length;
            if (renderCursor && (context.cursor.pos >= startPos) && (context.cursor.pos < endPos)) {
                let cursorRelPos = context.cursor.pos - startPos;
                let relSpan = makeSegSpan(segText.substring(cursorRelPos), textSegment, cursorRelPos + offset,
                    startChar);
                if (cursorRelPos > 0) {
                    let preSpan = makeSegSpan(segText.substring(0, cursorRelPos), textSegment, offset, startChar);
                    innerDiv.appendChild(preSpan);
                }
                cursorRendered = true;
                context.cursor.assign(relSpan);
                innerDiv.appendChild(relSpan);
            } else {
                let span = makeSegSpan(segText, textSegment, offset, startChar);
                innerDiv.appendChild(span);
            }
            return segText;
        }

        function renderFirstSegment(text: string, textSegment: SharedString.TextSegment) {
            segmentToSpan(text, textSegment, 0, segPos, false);
            let innerBounds = innerDiv.getBoundingClientRect();
            let x = innerBounds.left + Math.floor(context.wEst / 2);
            let y = innerBounds.top + Math.floor(context.hEst / 2);
            let offset = 0;
            let prevOffset = 0;
            let segspan = <ISegSpan>innerDiv.children[0];
            do {
                if (y > innerBounds.bottom) {
                    prevOffset = offset;
                    break;
                }
                let elmOff = pointerToElementOffsetWebkit(x, y);
                if (elmOff) {
                    prevOffset = offset;
                    offset = elmOffToSegOff(elmOff, segspan);
                    y += context.hEst;
                } else {
                    console.log(`no hit for ${x} ${y} start ${start}`);
                    prevOffset = offset;
                    break;
                }
            } while (offset < start);
            innerDiv.removeChild(segspan);
            offset = prevOffset;
            while ((offset >= 1) && (text.charCodeAt(offset - 1) !== CharacterCodes.space)) {
                offset--;
            }
            segOffset = offset;
            return text.substring(offset);
        }

        function freshDiv() {
            innerDiv = makeInnerDiv();
            div.appendChild(innerDiv);
        }

        if (segment.getType() === SharedString.SegmentType.Text) {
            let textSegment = <SharedString.TextSegment>segment;
            let last = (textSegment.text.length === end);
            if (firstSeg && (textSegment !== context.prevTopSegment)) {
                splitTopSeg = false;
                context.prevTopSegment = textSegment;
            }
            let segText = textSegment.text;
            if (start > 0) {
                if (splitTopSeg) {
                    segText = renderFirstSegment(segText, textSegment);
                    let actualStart = textSegment.text.length - segText.length;
                    context.adjustedTopChar = context.topChar + (actualStart - start);
                } else {
                    context.adjustedTopChar = context.topChar - start;
                }
                if (context.cursor.pos < context.adjustedTopChar) {
                    context.cursor.pos = context.adjustedTopChar;
                }
            } else {
                if (firstSeg) {
                    context.adjustedTopChar = context.topChar;
                }
            }
            firstSeg = false;
            charLength += segText.length;
            segText = segmentToSpan(segText, textSegment, segOffset, segPos, true);
            segOffset = 0;
            if (segText.charAt(segText.length - 1) === "\n") {
                freshDiv();
            }

            if ((charLength > charsPerViewport) || last) {
                // console.log(`client h, w ${div.clientHeight},${div.clientWidth}`);
                let constraint = bounds.height + bounds.top;
                let lastInnerBounds = innerDiv.getBoundingClientRect();
                if ((lastInnerBounds.bottom > constraint) || last) {
                    if (innerDiv.childNodes.length > 0) {
                        freshDiv();
                    }
                    if (innerDiv.previousElementSibling) {
                        let pruneDiv = <HTMLDivElement>innerDiv.previousElementSibling;
                        let lastPruned: HTMLDivElement;
                        while (pruneDiv) {
                            if (pruneDiv.getBoundingClientRect().bottom > constraint) {
                                let temp = <HTMLDivElement>pruneDiv.previousElementSibling;
                                div.removeChild(pruneDiv);
                                lastPruned = pruneDiv;
                                pruneDiv = temp;
                            } else {
                                break;
                            }
                        }
                        if (lastPruned) {
                            div.appendChild(lastPruned);
                            let lastSeg: SharedString.TextSegment;
                            let lastSegOff = 0;
                            for (let i = 0; i < lastPruned.childElementCount; i++) {
                                let prunedSpan = <ISegSpan>lastPruned.children[i];
                                let spanBounds = prunedSpan.getBoundingClientRect();
                                if (spanBounds.bottom <= constraint) {
                                    innerDiv.appendChild(prunedSpan);
                                    lastSeg = prunedSpan.seg;
                                    lastSegOff = lastSeg.text.length;
                                } else {
                                    if ((constraint - spanBounds.top) > context.hEst) {
                                        let rects = prunedSpan.getClientRects();
                                        let x = 0;
                                        let y = 0;
                                        let rect: ClientRect;
                                        for (let j = rects.length - 1; j >= 0; j--) {
                                            rect = rects.item(j);
                                            if (rect.bottom <= constraint) {
                                                x = rect.right - Math.floor(w / 2);
                                                y = rect.bottom - Math.floor(h / 2);
                                                break;
                                            }
                                        }
                                        if (y > 0) {
                                            let elmOff = pointerToElementOffsetWebkit(x, y);
                                            let segClip = elmOffToSegOff(elmOff, prunedSpan) + 1;
                                            let textSeg = <SharedString.TextSegment>prunedSpan.seg;
                                            while ((segClip > 0) &&
                                                (textSeg.text.charCodeAt(segClip) !== CharacterCodes.space) &&
                                                (textSeg.text.charAt(segClip) !== "\n")) {
                                                segClip--;
                                            }
                                            if (segClip > 0) {
                                                segmentToSpan(textSeg.text.substring(0, segClip), textSeg, 0,
                                                    prunedSpan.segPos, true, segClip + prunedSpan.segPos);
                                            }
                                            lastSegOff = segClip;
                                            lastSeg = textSeg;
                                        }
                                    }
                                    break;
                                }
                            }
                            div.removeChild(lastPruned);
                            if (lastSeg) {
                                // tslint:disable:max-line-length
                                let segStart = context.client.mergeTree.getOffset(lastSeg, context.client.getCurrentSeq(),
                                    context.client.getClientId());
                                context.viewportEndChar = segStart + lastSegOff;
                            }
                        }
                        return false;
                    }
                }
            }
        }
        return true;
    }
    client.mergeTree.mapRange({ leaf: renderSegment }, SharedString.UniversalSequenceNumber,
        client.getClientId(), undefined, pos);
    if (context.viewportEndChar < 0) {
        let endChar = findLastChar();
        if (endChar < 0) {
            context.viewportEndChar = charLength + context.adjustedTopChar;
        } else {
            context.viewportEndChar = endChar;
        }
    }
    if ((!cursorRendered) || (context.cursor.pos > context.viewportEndChar)) {
        if (firstDiv && (firstDiv.children.length > 0)) {
            let firstSpan = <ISegSpan>firstDiv.children[0];
            let curpos = firstSpan.segPos;
            if (firstSpan.offset) {
                curpos += firstSpan.offset;
            }
            context.cursor.pos = curpos;
            context.cursor.assign(firstSpan);
        }
    }
}

function pointerToElementOffsetWebkit(x: number, y: number): IRangeInfo {
    let range = document.caretRangeFromPoint(x, y);
    if (range) {
        let result = {
            elm: <HTMLElement>range.startContainer.parentElement,
            node: range.startContainer,
            offset: range.startOffset,
        };
        range.detach();
        return result;
    }
}

export function clearSubtree(elm: HTMLElement) {
    while (elm.lastChild) {
        elm.removeChild(elm.lastChild);
    }
}

export interface IStatus {
    add(key: string, msg: string);
    remove(key: string);
    overlay(msg: string);
    removeOverlay();
    onresize();
}

export interface IComponentContainer {
    div: HTMLDivElement;
    onresize: () => void;
    onkeydown: (e: KeyboardEvent) => void;
    status: IStatus;
}

class Cursor {
    public off = true;
    public parentSpan: HTMLSpanElement;
    public editSpan: HTMLSpanElement;
    private blinkCount = 0;
    private blinkTimer: any;

    constructor(public pos = 0) {
        this.makeSpan();
    }

    public hide() {
        this.editSpan.style.visibility = "hidden";
    }

    public show() {
        this.editSpan.style.backgroundColor = "blue";
        this.editSpan.style.visibility = "visible";
    }

    public makeSpan() {
        this.editSpan = document.createElement("span");
        this.editSpan.id = "cursor";
        this.editSpan.innerText = "\uFEFF";
        this.editSpan.style.position = "absolute";
        this.editSpan.style.left = "0px";
        this.editSpan.style.top = "0px";
        this.editSpan.style.width = "1px";
        this.show();
    }

    public assign(parentSpan: HTMLSpanElement) {
        if (this.editSpan.parentElement) {
            this.editSpan.parentElement.removeChild(this.editSpan);
        }
        parentSpan.style.position = "relative";
        parentSpan.appendChild(this.editSpan);
        this.parentSpan = parentSpan;
        if (this.blinkTimer) {
            clearTimeout(this.blinkTimer);
        }
        this.blinkCursor();
    }

    private blinker = () => {
        if (this.off) {
            this.show();
        } else {
            this.hide();
        }
        this.off = !this.off;
        if (this.blinkCount > 0) {
            this.blinkCount--;
            this.blinkTimer = setTimeout(this.blinker, 500);
        } else {
            this.show();
        }
    }

    private blinkCursor() {
        this.blinkCount = 30;
        this.off = true;
        this.blinkTimer = setTimeout(this.blinker, 20);
    }
}

export class FlowView {
    public static scrollAreaWidth = 18;

    public wEst = 0;
    public hEst = 22;
    public timeToImpression: number;
    public timeToLoad: number;
    public timeToEdit: number;
    public timeToCollab: number;
    public viewportCharCount: number;
    public charsPerLine: number;
    public prevTopSegment: SharedString.TextSegment;
    public adjustedTopChar: number;
    public viewportEndChar: number;
    public cursorSpan: HTMLSpanElement;
    public containerDiv: HTMLDivElement;
    public viewportDiv: HTMLDivElement;
    public viewportRect: Geometry.Rectangle;
    public scrollDiv: HTMLDivElement;
    public scrollRect: Geometry.Rectangle;
    public statusDiv: HTMLDivElement;
    public statusRect: Geometry.Rectangle;
    public client: SharedString.Client;
    public ticking = false;
    public wheelTicking = false;
    public topChar = 0;
    public cursor: Cursor;
    private randWordTimer: any;
    private pendingRender = false;
    private diagCharPort = true;

    constructor(public sharedString: SharedString.SharedString, public totalSegmentCount,
        public totalLengthChars, public flowContainer: IComponentContainer,
        insights: API.IMap) {
        this.containerDiv = flowContainer.div;
        this.client = sharedString.client;
        this.viewportDiv = document.createElement("div");
        this.containerDiv.appendChild(this.viewportDiv);
        this.scrollDiv = document.createElement("div");
        this.containerDiv.appendChild(this.scrollDiv);
        this.widthEst("18px Times");

        this.updateGeometry();
        this.statusMessage("li", " ");
        this.statusMessage("si", " ");
        sharedString.on("op", (msg: API.IMessageBase) => {
            let delta = <API.IMergeTreeDeltaMsg>msg.op;
            this.queueRender(delta);
        });

        this.trackInsights(insights);
        this.cursor = new Cursor();
    }

    public widthEst(fontInfo: string) {
        let innerDiv = makeInnerDiv();
        this.wEst = getTextWidth("abcdefghi jklmnopqrstuvwxyz", innerDiv.style.font) / 27;
    }

    public updateGeometry() {
        let bounds = Geometry.Rectangle.fromClientRect(this.containerDiv.getBoundingClientRect());
        Geometry.Rectangle.conformElementToRect(this.containerDiv, bounds);
        let panelScroll = bounds.nipHorizRight(FlowView.scrollAreaWidth);
        this.scrollRect = panelScroll[1];
        Geometry.Rectangle.conformElementToRect(this.scrollDiv, this.scrollRect);
        this.viewportRect = panelScroll[0].inner(0.92);
        Geometry.Rectangle.conformElementToRect(this.viewportDiv, this.viewportRect);
        this.charsPerLine = this.viewportRect.width / Math.floor(this.wEst); // overestimate
        let charsPerViewport = Math.floor((this.viewportRect.height / this.hEst) * this.charsPerLine);
        this.viewportCharCount = charsPerViewport;
    }

    public statusMessage(key: string, msg: string) {
        this.flowContainer.status.add(key, msg);
    }

    public setEdit() {
        this.containerDiv.onclick = (e) => {
            let span = <ISegSpan>e.target;
            let segspan: ISegSpan;
            if (span.seg) {
                segspan = span;
            } else {
                segspan = <ISegSpan>span.parentElement;
            }
            if (segspan && segspan.seg) {
                let segOffset = this.client.mergeTree.getOffset(segspan.seg, this.client.getCurrentSeq(),
                    this.client.getClientId());
                let elmOff = pointerToElementOffsetWebkit(e.clientX, e.clientY);
                let computed = elmOffToSegOff(elmOff, segspan);
                // tslint:disable:max-line-length
                let diag = `segment at char offset ${segOffset} within: ${elmOff.offset} computed: (${computed}, ${computed + segOffset})`;
                if (this.diagCharPort) {
                    this.statusMessage("segclick", diag);
                }
                console.log(diag);
            }
        };

        this.containerDiv.onmousewheel = (e) => {
            if (!this.wheelTicking) {
                let factor = Math.round(this.viewportCharCount / this.charsPerLine);
                let inputDelta = e.wheelDelta;
                if (Math.abs(e.wheelDelta) === 120) {
                    inputDelta = e.wheelDelta / 6;
                } else {
                    inputDelta = e.wheelDelta / 2;
                }
                let delta = factor * inputDelta;
                console.log(`top char: ${this.topChar - delta} factor ${factor}; delta: ${delta} wheel: ${e.wheelDeltaY} ${e.wheelDelta} ${e.detail}`);
                setTimeout(() => {
                    this.render(Math.floor(this.topChar - delta));
                    this.wheelTicking = false;
                }, 20);
                this.wheelTicking = true;
            }
            e.preventDefault();
            e.returnValue = false;
        };
        this.flowContainer.onresize = () => {
            this.updateGeometry();
            this.render(this.topChar, true);
        };
        let handler = (e: KeyboardEvent) => {
            console.log(`key ${e.keyCode}`);
            if (((e.keyCode === 33) || (e.keyCode === 34)) && (!this.ticking)) {
                setTimeout(() => {
                    this.scroll(e.keyCode === 33);
                    this.ticking = false;
                }, 20);
                this.ticking = true;
            } else if (e.keyCode === 36) {
                this.cursor.pos = 0;
                this.render(0);
                e.preventDefault();
                e.returnValue = false;
            } else if (e.keyCode === 35) {
                let halfport = Math.floor(this.viewportCharCount / 2);
                let topChar = this.client.getLength() - halfport;
                this.cursor.pos = topChar;
                this.render(topChar);
                e.preventDefault();
                e.returnValue = false;
            }
        };

        this.flowContainer.onkeydown = handler;
    }

    public scroll(up: boolean) {
        let len = this.client.getLength();
        let halfport = Math.floor(this.viewportCharCount / 2);
        if ((up && (this.topChar === 0)) || ((!up) && (this.topChar > (len - halfport)))) {
            return;
        }
        let scrollTo = this.topChar;
        if (up) {
            scrollTo -= halfport;
        } else {
            scrollTo += halfport;
        }
        this.render(scrollTo);
    }

    public renderIfVisible(viewChar: number) {
        // console.log(`view char: ${viewChar} top: ${this.topChar} adj: ${this.adjustedTopChar} bot: ${this.viewportEndChar}`);
        let len = this.client.getLength();
        if ((viewChar <= this.viewportEndChar) || (len < this.viewportCharCount)) {
            this.render(this.topChar, true);
        }
    }

    public render(topChar?: number, changed = false) {
        let len = this.client.getLength();
        if (topChar !== undefined) {
            if (((this.topChar === topChar) || ((this.topChar === 0) && (topChar <= 0)))
                && (!changed)) {
                return;
            }
            this.topChar = topChar;
            if (this.topChar >= len) {
                this.topChar = len - this.charsPerLine;
            }
            if (this.topChar < 0) {
                this.topChar = 0;
            }
        }
        let clk = Date.now();
        let frac = this.topChar / len;
        let pos = Math.floor(frac * len);
        clearSubtree(this.viewportDiv);
        renderTree(this.viewportDiv, pos, this.client, this);
        clearSubtree(this.scrollDiv);
        let bubbleHeight = Math.max(3, Math.floor((this.viewportCharCount / len) * this.scrollRect.height));
        let bubbleTop = Math.floor(frac * this.scrollRect.height);
        let bubbleLeft = 3;
        let bubbleDiv = makeScrollLosenge(bubbleHeight, bubbleLeft, bubbleTop);
        this.scrollDiv.appendChild(bubbleDiv);
        this.statusMessage("render", `&nbsp ${Date.now() - clk}ms`);
        if (this.diagCharPort) {
            this.statusMessage("diagCharPort",
                `&nbsp sp: (${this.topChar}, ${this.adjustedTopChar}) ep: ${this.viewportEndChar} cp: ${this.cursor.pos}`);
        }
    }

    public loadFinished(clockStart = 0) {
        this.render(0, true);
        if (clockStart > 0) {
            // tslint:disable-next-line:max-line-length
            console.log(`time to edit/impression: ${this.timeToEdit} time to load: ${Date.now() - clockStart}ms len: ${this.sharedString.client.getLength()}`);
        }
    }

    public randomWordMove() {
        let client = this.sharedString.client;
        let word1 = SharedString.findRandomWord(client.mergeTree, client.getClientId());
        if (word1) {
            let removeStart = word1.pos;
            let removeEnd = removeStart + word1.text.length;
            this.sharedString.removeText(removeStart, removeEnd);
            let word2 = SharedString.findRandomWord(client.mergeTree, client.getClientId());
            while (!word2) {
                word2 = SharedString.findRandomWord(client.mergeTree, client.getClientId());
            }
            let pos = word2.pos + word2.text.length;
            this.sharedString.insertText(word1.text, pos);
        }
    }

    public randomWordMoveStart() {
        this.randWordTimer = setInterval(() => {
            for (let i = 0; i < 3; i++) {
                this.randomWordMove();
            }
        }, 10);
    }

    public randomWordMoveEnd() {
        clearInterval(this.randWordTimer);
    }

    private queueRender(delta: API.IMergeTreeDeltaMsg) {
        if ((!this.pendingRender) && delta) {
            this.pendingRender = true;
            window.requestAnimationFrame(() => {
                this.pendingRender = false;
                let viewChar = 0;
                if (delta.type === API.MergeTreeMsgType.INSERT) {
                    viewChar = delta.pos1 + delta.text.length;
                } else {
                    viewChar = delta.pos2;
                }
                this.renderIfVisible(viewChar);
            });
        }
    }

    private async updateInsights(insights: API.IMap) {
        const view = await insights.getView();

        if (view.has("Resume")) {
            const resume = view.get("Resume");
            const probability = parseFloat(resume);
            if (probability !== 1 && probability > 0.7) {
                this.flowContainer.status.overlay(`${Math.round(probability * 100)}% sure I found a resume!`);
            }
        }

        if (view.has("TextAnalytics")) {
            const analytics = view.get("TextAnalytics");
            if (analytics.language) {
                this.statusMessage("li", analytics.language);
            }

            if (analytics.sentiment) {
                const sentimentEmoji = analytics.sentiment > 0.7
                    ? "🙂"
                    : analytics.sentiment < 0.3 ? "🙁" : "😐";
                this.statusMessage("si", sentimentEmoji);
            }
        }
    }

    private trackInsights(insights: API.IMap) {
        this.updateInsights(insights);
        insights.on("valueChanged", () => {
            this.updateInsights(insights);
        });
    }
}
