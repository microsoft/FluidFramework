/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as SearchMenu from "@chaincode/search-menu";
import * as ClientUI from "@prague/client-ui";
import { ComponentRuntime } from "@prague/component-runtime";
import {
    IComponent,
    IComponentHTMLOptions,
    IComponentHTMLRender,
    IComponentHTMLView,
    IComponentHTMLVisual,
    IComponentRouter,
    IRequest,
    IResponse,
    ISharedComponent,
} from "@prague/container-definitions";
import { Caret, CaretEventType, Direction, ICaretEvent } from "@prague/flow-util";
import {
    CounterValueType,
    DistributedSetValueType,
    ISharedMap,
    SharedMap,
} from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import {
    ComponentCursorDirection,
    IComponentCollection,
    IComponentContext,
    IComponentCursor,
    IComponentLayout,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import * as Sequence from "@prague/sequence";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import * as Katex from "katex";
import * as MathExpr from "./mathExpr";

const directionToCursorDirection = {
    [Direction.left]: ComponentCursorDirection.Left,
    [Direction.right]: ComponentCursorDirection.Right,
    [Direction.up]: ComponentCursorDirection.Up,
    [Direction.down]: ComponentCursorDirection.Down,
    [Direction.none]: ComponentCursorDirection.Airlift,
};

const cursorDirectionToDirection = {
    [ComponentCursorDirection.Left]: Direction.left,
    [ComponentCursorDirection.Right]: Direction.right,
    [ComponentCursorDirection.Up]: Direction.up,
    [ComponentCursorDirection.Down]: Direction.down,
    [ComponentCursorDirection.Airlift]: Direction.none,
};

type IMathMarkerInst = MathExpr.IMathMarker;

class MathView implements IComponentHTMLView, IComponentCursor, IComponentLayout {
    public static supportedInterfaces = [
        "IComponentLayout", "IComponentCursor", "IComponentHTMLRender", "IComponentHTMLView"];

    public cursorActive = false;
    public cursorElement: HTMLElement;
    // IComponentLayout
    public canInline = true;
    public containerElement: HTMLElement;
    public mathCursor = 0;
    public mathTokenIndex = 0;
    public searchMenuHost: SearchMenu.ISearchMenuHost;
    public options?: IComponentHTMLOptions;
    public rootElement: HTMLElement;

    constructor(public instance: MathInstance, public scope?: IComponent) {
        if (scope) {
            this.searchMenuHost = scope.query("ISearchMenuHost");
        }
        this.options = this.instance.options;
    }

    public query(id: string): any {
        return MathView.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return MathView.supportedInterfaces;
    }

    // IComponentHTMLView
    public render(containerElement: HTMLElement, options?: IComponentHTMLOptions) {
        if (options) {
            this.options = options;
        }
        this.buildTree(containerElement, this.options.display);
    }

    public remove() {
        this.instance.removeView(this);
    }

    public remoteEdit(pos: number, len: number, isInsert: boolean) {
        if (this.cursorActive) {
            const mathMarker = this.instance.endMarker;
            let mathCursorNew = this.mathCursor;
            if (isInsert) {
                if (pos <= mathCursorNew) {
                    mathCursorNew += len;
                }
            } else {
                if ((pos + len) <= mathCursorNew) {
                    mathCursorNew -= len;
                } else {
                    mathCursorNew = pos;
                }
            }
            this.mathCursor = mathCursorNew;
            this.mathTokenIndex = MathExpr.tokenAtPos(mathCursorNew,
                mathMarker.mathTokens);
        }
        this.localRender();
    }

    // IComponentCursor
    public enter(direction: ComponentCursorDirection) {
        console.log(`enter: ${ComponentCursorDirection[direction]}`);
        this.cursorActive = true;
        if (direction === ComponentCursorDirection.Right) {
            this.mathCursor = 0;
            this.mathTokenIndex = 0;
        } else if (direction === ComponentCursorDirection.Left) {
            const mathText = this.instance.getMathText();
            this.mathCursor = mathText.length;
            this.mathTokenIndex = this.instance.endMarker.mathTokens.length;
        }
    }

    public leave(direction: ComponentCursorDirection) {
        this.cursorActive = false;
    }

    public rev() {
        const mathMarker = this.instance.endMarker;
        this.mathTokenIndex = MathExpr.mathTokRev(this.mathTokenIndex,
            mathMarker.mathTokens);
        if (this.mathTokenIndex !== MathExpr.Nope) {
            this.mathCursor = MathExpr.posAtToken(this.mathTokenIndex, mathMarker.mathTokens);
        } else {
            this.mathCursor = 0;
            this.mathTokenIndex = 0;
            this.noteCursorExit(ComponentCursorDirection.Left);
            return true;
        }
    }

    public fwd() {
        const mathMarker = this.instance.endMarker;
        this.mathTokenIndex = MathExpr.mathTokFwd(this.mathTokenIndex,
            mathMarker.mathTokens);
        if (this.mathTokenIndex > mathMarker.mathTokens.length) {
            this.noteCursorExit(ComponentCursorDirection.Right);
            return true;
        } else if (this.mathTokenIndex === mathMarker.mathTokens.length) {
            const mathText = this.instance.getMathText();
            this.mathCursor = mathText.length;
        } else {
            this.mathCursor = MathExpr.posAtToken(this.mathTokenIndex, mathMarker.mathTokens);
        }
    }

    public setListeners() {
        this.containerElement.tabIndex = 0;
        this.containerElement.style.outline = "none";
        this.containerElement.addEventListener("focus", () => {
            console.log("focus...");
            this.enter(ComponentCursorDirection.Focus);
            this.localRender();
        });
        this.containerElement.addEventListener("blur", () => {
            this.leave(ComponentCursorDirection.Focus);
            this.localRender();
        });
        this.containerElement.addEventListener("keydown", (e) => {
            this.onKeydown(e);
        });
        this.containerElement.addEventListener("keypress", (e) => {
            this.onKeypress(e);
        });
        this.containerElement.addEventListener(CaretEventType.enter, ((e: ICaretEvent) => {
            // Let caller know we've handled the event:
            e.preventDefault();
            e.stopPropagation();
            const cursorDirection = directionToCursorDirection[e.detail.direction];
            console.log(`caret event ${ComponentCursorDirection[cursorDirection]}`);
            this.enter(cursorDirection);
        }) as EventListener);
    }

    public buildAlignedAsDiv(mathLines: string[], elm: HTMLElement) {
        let count = 1;
        for (const line of mathLines) {
            const lineDiv = document.createElement("div");
            elm.appendChild(lineDiv);
            const eqIndex = line.indexOf("=");
            if (eqIndex >= 0) {
                const preEq = line.substring(0, eqIndex);
                const postEq = line.substring(eqIndex + 1);
                const preEqElm = document.createElement("span");
                preEqElm.style.width = "35%";
                Katex.render(preEq, preEqElm,
                    { throwOnError: false, displayMode: true });

                const eqElm = document.createElement("span");
                eqElm.style.width = "10%";
                Katex.render("=", eqElm,
                    { throwOnError: false, displayMode: true });
                const postEqElm = document.createElement("span");
                postEqElm.style.width = "35%";
                Katex.render(postEq, postEqElm,
                    { throwOnError: false, displayMode: true });
                lineDiv.appendChild(preEqElm);
                lineDiv.appendChild(eqElm);
                lineDiv.appendChild(postEqElm);
            } else {
                const eqElm = document.createElement("span");
                eqElm.style.width = "80%";
                Katex.render("=", eqElm,
                    { throwOnError: false, displayMode: true });
                lineDiv.appendChild(eqElm);
            }
            const tagElm = document.createElement("span");
            tagElm.style.width = "20%";
            Katex.render(`\\tag{${count++}}{}`, tagElm,
                { throwOnError: false, displayMode: true });
            lineDiv.appendChild(tagElm);
            count++;
        }
    }

    public buildAligned(mathLines: string[]) {
        let mathBuffer = "\\begin{darray}{rcllcr} \n";
        let count = 1;
        for (let line of mathLines) {
            if (line.indexOf("=") >= 0) {
                line = line.replace("=", "& = &");
            } else {
                line = `& ${line} &`;
            }
            mathBuffer += `${line} & & \\hspace{20ex} & \\textrm{(${count++})} \\\\ \n`;
        }
        mathBuffer += "\\end{darray}";
        return mathBuffer;
    }

    public buildTree(elm: HTMLElement, display?: string) {
        if (this.containerElement !== elm) {
            this.containerElement = elm;
            this.setListeners();
        }
        if (display === undefined) {
            display = this.options.display;
        }
        const mathText = this.instance.getMathText();
        let mathBuffer = mathText;
        const mathMarker = this.instance.endMarker;
        this.containerElement = elm;
        if (mathMarker.mathTokens === undefined) {
            mathMarker.mathTokens = [] as MathExpr.MathToken[];
            mathMarker.mathText = "";
        }
        let rootElement: HTMLElement;
        if (display === "inline") {
            rootElement = document.createElement("span");
            rootElement.style.marginLeft = "2px";
            rootElement.style.marginTop = "4px";
            rootElement.style.marginRight = "2px";
            if (this.cursorActive) {
                rootElement.style.borderLeft = "solid orange 2px";
                rootElement.style.borderRight = "solid orange 2px";
                // showCursor
                mathBuffer = mathBuffer.substring(0, this.mathCursor) +
                    MathExpr.cursorTex +
                    mathBuffer.substring(this.mathCursor);
                mathBuffer = MathExpr.boxEmptyParam(mathBuffer);
            }
            Katex.render(mathBuffer, rootElement,
                { throwOnError: false });
        } else {
            const useDarray = true;
            rootElement = document.createElement("div");
            if (this.cursorActive) {
                // showCursor
                mathBuffer = mathBuffer.substring(0, this.mathCursor) +
                    MathExpr.cursorTex +
                    mathBuffer.substring(this.mathCursor);
                mathBuffer = MathExpr.boxEmptyParam(mathBuffer);
            }
            const mathLines = mathBuffer.split("\n");
            if (useDarray) {
                mathBuffer = this.buildAligned(mathLines);
                Katex.render(mathBuffer, rootElement,
                    { throwOnError: false, displayMode: true });
            } else {
                this.buildAlignedAsDiv(mathLines, rootElement);
            }
        }
        if (this.cursorActive) {
            const cursorElement = ClientUI.controls.findFirstMatch(rootElement, (cursor: HTMLElement) => {
                return cursor.style && (cursor.style.color === MathExpr.cursorColor);
            });
            if (cursorElement) {
                this.cursorElement = cursorElement;
                cursorElement.classList.add("blinking");
            }
        }
        this.rootElement = rootElement;
        elm.appendChild(rootElement);
    }

    public localRender() {
        if (this.containerElement) {
            ClientUI.controls.clearSubtree(this.containerElement);
            this.buildTree(this.containerElement, this.options.display);
        }
    }

    public onKeydown(e: KeyboardEvent) {
        if (e.keyCode === ClientUI.controls.KeyCode.backspace) {
            const mathMarker = this.instance.endMarker;
            const toRemoveMath = MathExpr.bksp(mathMarker, this);
            if (toRemoveMath) {
                this.instance.removeText(toRemoveMath.start, toRemoveMath.end);
            }
            const mathText = this.instance.collection.getText(this.instance);
            mathMarker.mathText = mathText;
            mathMarker.mathTokens = MathExpr.lexMath(mathText);
            this.mathCursor = MathExpr.posAtToken(this.mathTokenIndex, mathMarker.mathTokens);
            if (this.containerElement) {
                ClientUI.controls.clearSubtree(this.containerElement);
                this.buildTree(this.containerElement, this.options.display);
            }
        } else if (e.keyCode === ClientUI.controls.KeyCode.rightArrow) {
            if (this.fwd()) {
                this.leave(ComponentCursorDirection.Right);
            }
            this.localRender();
        } else if (e.keyCode === ClientUI.controls.KeyCode.leftArrow) {
            if (this.rev()) {
                this.leave(ComponentCursorDirection.Left);
            }
            this.localRender();
        }
    }

    public insertText(text: string) {
        this.instance.insertText(text, this.mathCursor);
        const mathMarker = this.instance.endMarker;
        this.mathTokenIndex = MathExpr.mathTokFwd(this.mathTokenIndex, mathMarker.mathTokens);
        this.mathCursor = MathExpr.posAtToken(this.mathTokenIndex, mathMarker.mathTokens);
        console.log(`set math cursor to ${this.mathCursor} on input ${text}`);
        if (this.containerElement) {
            ClientUI.controls.clearSubtree(this.containerElement);
            this.buildTree(this.containerElement, this.instance.options.display);
        }
    }

    public onKeypress(e: KeyboardEvent) {
        if (e.charCode === ClientUI.controls.CharacterCodes.backslash) {
            if (this.searchMenuHost) {
                this.searchMenuHost.showSearchMenu(MathExpr.mathCmdTree, false, true,
                    (s, cmd) => {
                        let text = `\\${s}`;
                        if (cmd) {
                            text = (cmd as MathExpr.IMathCommand).texString;
                        }
                        this.insertText(text);
                    });
            }
        } else {
            const toInsert = MathExpr.transformInputCode(e.charCode);
            if (toInsert) {
                this.insertText(toInsert);
            } else {
                console.log(`unrecognized math input ${e.char}`);
            }
        }
    }

    private noteCursorExit(direction: ComponentCursorDirection) {
        const cursorElement = ClientUI.controls.findFirstMatch(this.containerElement, (cursor: HTMLElement) => {
            return cursor.style && (cursor.style.color === MathExpr.cursorColor);
        }) || this.containerElement;

        Caret.caretLeave(this.containerElement, cursorDirectionToDirection[direction], cursorElement.getBoundingClientRect());
    }

}

export class MathInstance implements ISharedComponent, IComponentRouter,
    IComponentHTMLVisual, IComponentHTMLRender {
    public static defaultOptions: IMathOptions = { display: "inline" };
    public static supportedInterfaces = [
        "IComponentLoadable", "IComponentRouter", "IComponentCollection", "IComponentHTMLVisual",
        "IComponentHTMLRender",
    ];
    public views: MathView[];
    public endMarker: IMathMarkerInst;
    public startMarker: MergeTree.Marker;
    private defaultView: MathView;

    constructor(
        public url: string,
        public leafId: string,
        public readonly collection: MathCollection,
        public readonly options = MathInstance.defaultOptions,
        inCombinedText = false) {
        this.initialize(inCombinedText);
    }

    public addView(scope?: IComponent) {
        if (!this.views) {
            this.views = [];
        }
        const view = new MathView(this, scope);
        this.views.push(view);
        return view;
    }

    public removeView(view: MathView) {
        const index = this.views.indexOf(view);
        if (index >= 0) {
            this.views.splice(index, 1);
        }
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions) {
        if (!this.defaultView) {
            this.defaultView = this.addView();
        }
        let localOptions = this.options;
        if (options) {
            localOptions = options;
        }
        this.defaultView.render(elm, localOptions);
    }

    public insertText(text: string, pos: number) {
        this.collection.insertText(text, this.leafId, pos);
    }

    public removeText(startPos: number, endPos: number) {
        this.collection.removeText(this, startPos, endPos);
    }

    public query(id: string): any {
        return MathInstance.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return MathInstance.supportedInterfaces;
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "prague/component",
            status: 200,
            value: this,
        };
    }

    public detach() {
    }

    public remoteEdit(pos: number, len: number, isInsert: boolean) {
        const mathMarker = this.endMarker;
        const mathText = this.collection.getText(this);
        mathMarker.mathTokens = MathExpr.lexMath(mathText);
        mathMarker.mathText = mathText;
        for (const view of this.views) {
            view.remoteEdit(pos, len, isInsert);
        }
    }

    public postInsert() {
        const mathText = this.collection.getText(this);
        const mathMarker = this.endMarker;
        mathMarker.mathText = mathText;
        mathMarker.mathTokens = MathExpr.lexMath(mathText);
    }

    public getMathText() {
        return this.collection.getText(this);
    }

    private initialize(inCombinedText: boolean) {
        this.collection.appendMathMarkers(this, inCombinedText);
    }
}

function getOffset(client: MergeTree.Client, segment: MergeTree.ISegment) {
    return client.mergeTree.getOffset(segment, MergeTree.UniversalSequenceNumber, client.getClientId());
}

const endIdPrefix = "end-";

// tslint:disable-next-line:no-empty-interface
export interface IMathOptions extends IComponentHTMLOptions { }

export class MathCollection implements ISharedComponent, IComponentCollection, IComponentRouter {
    public static supportedInterfaces = ["IComponentLoadable", "IComponentRouter",
        "IComponentCollection"];

    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new MathCollection(runtime, context);
        await collection.initialize();

        return collection;
    }

    public url: string;

    private root: ISharedMap;
    private combinedMathText: Sequence.SharedString;

    constructor(private readonly runtime: IComponentRuntime, context: IComponentContext) {
        this.url = context.id;
    }

    public query(id: string): any {
        return MathCollection.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return MathCollection.supportedInterfaces;
    }

    public appendMathMarkers(instance: MathInstance, inCombinedText: boolean) {
        const endId = endIdPrefix + instance.leafId;
        if (!inCombinedText) {
            let pos = this.combinedMathText.getLength();
            this.combinedMathText.insertMarker(pos++, MergeTree.ReferenceType.Tile, {
                [MergeTree.reservedTileLabelsKey]: ["math"],
                [MergeTree.reservedMarkerIdKey]: instance.leafId,
                mathStart: true,
            });
            this.combinedMathText.insertMarker(pos, MergeTree.ReferenceType.Tile, {
                componentOptions: instance.options,
                [MergeTree.reservedTileLabelsKey]: ["math"],
                [MergeTree.reservedMarkerIdKey]: endId,
                mathEnd: true,
            });
        }
        let seg = this.combinedMathText.client.mergeTree.getSegmentFromId(endId);
        const mathMarker = seg as MathExpr.IMathMarker;
        instance.endMarker = mathMarker;
        mathMarker.mathInstance = instance;
        seg = this.combinedMathText.client.mergeTree.getSegmentFromId(instance.leafId);
        instance.startMarker = seg as MergeTree.Marker;
        mathMarker.mathText = this.getText(instance);
        mathMarker.mathTokens = MathExpr.lexMath(mathMarker.mathText);
    }

    public create(options?: IMathOptions): MathInstance {
        const leafId = `math-${Date.now()}`;
        return new MathInstance(`${this.url}/${leafId}`, leafId, this, options);
    }

    public getText(instance: MathInstance) {
        const client = this.combinedMathText.client;
        const startMarker = instance.startMarker;
        const start = getOffset(client, startMarker) + startMarker.cachedLength;
        const endMarker = instance.endMarker;
        const end = getOffset(client, endMarker);
        return this.combinedMathText.getText(start, end);
    }

    public remove(instance: MathInstance) {
        const client = this.combinedMathText.client;
        const startMarker = instance.startMarker;
        const start = getOffset(client, startMarker);
        const endMarker = instance.endMarker;
        const end = getOffset(client, endMarker) + endMarker.cachedLength;
        this.combinedMathText.removeRange(start, end);
    }

    public async request(request: IRequest): Promise<IResponse> {
        const instanceId = request.url
            .substr(1)
            .substr(0, request.url.indexOf("/", 1) === -1 ? request.url.length : request.url.indexOf("/"));

        if (!instanceId) {
            return {
                mimeType: "prague/component",
                status: 200,
                value: this,
            };
        }

        const instance = this.getInstance(instanceId);
        // FIX this using a routing toolkit (don't end route here!)
        const trimmedRequest = { url: "/" };
        if (instance !== undefined) {
            return instance.request(trimmedRequest);
        }
    }

    public insertText(text: string, instanceId: string, offset: number) {
        const instance = this.getInstance(instanceId);
        const pos = this.getStartPos(instance) + offset;
        this.combinedMathText.insertText(text, pos);
        instance.postInsert();
    }

    public removeText(instance: MathInstance, start: number, end: number) {
        const startPos = this.getStartPos(instance);
        this.combinedMathText.removeRange(startPos + start, startPos + end);
    }

    public getInstance(id: string, options = MathInstance.defaultOptions) {
        const endId = endIdPrefix + id;
        const mathMarker = this.combinedMathText.client.mergeTree.getSegmentFromId(endId) as IMathMarkerInst;
        if (mathMarker !== undefined) {
            if (!mathMarker.mathInstance) {
                if (mathMarker.properties.componentOptions) {
                    options = mathMarker.properties.componentOptions;
                }
                mathMarker.mathInstance = new MathInstance(`${this.url}/${id}`, id, this, options, true);
            }
            return mathMarker.mathInstance as MathInstance;
        }
    }

    private getStartPos(instance: MathInstance) {
        const client = this.combinedMathText.client;
        const startMarker = instance.startMarker;
        const start = getOffset(client, startMarker);
        return start + startMarker.cachedLength;
    }

    private findTile(startPos: number, tileType: string, preceding: boolean) {
        return this.combinedMathText.findTile(startPos, tileType, preceding);
    }

    private async initialize() {
        if (!this.runtime.existing) {
            this.root = SharedMap.create(this.runtime, "root");
            this.combinedMathText = Sequence.SharedString.create(this.runtime, "mathText");
            this.root.register();
            this.combinedMathText.register();
        } else {
            this.root = await this.runtime.getChannel("root") as ISharedMap;
            this.combinedMathText = await this.runtime.getChannel("mathText") as Sequence.SharedString;
        }
        this.combinedMathText.on("sequenceDelta", (event) => {
            if ((!event.isLocal) && (event.ranges.length > 0) && (event.clientId !== "original")) {
                let pos: number;
                let len = 0;
                event.ranges.forEach((range) => {
                    pos = range.offset;
                    len += range.segment.cachedLength;
                });
                // console.log(`got event from ${event.clientId} pos: ${pos}`);
                const tileInfo = this.findTile(pos, "math", false);
                if (tileInfo && (tileInfo.tile.properties.mathEnd)) {
                    const mathMarker = tileInfo.tile as IMathMarkerInst;
                    const leafId = mathMarker.getId().substring(endIdPrefix.length);
                    const instance = this.getInstance(leafId);
                    const startPos = this.getStartPos(instance);
                    instance.remoteEdit(pos - startPos, len, event.deltaOperation === MergeTree.MergeTreeDeltaType.INSERT);
                }

            }
        });

    }
}

export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    // Map value types to register as defaults
    const mapValueTypes = [
        new DistributedSetValueType(),
        new CounterValueType(),
        new Sequence.SharedStringIntervalCollectionValueType(),
        new Sequence.SharedIntervalCollectionValueType(),
    ];

    // tslint:disable:no-require-imports no-submodule-imports
    require("katex/dist/katex.min.css");
    require("./index.css");
    const mapExtension = SharedMap.getFactory(mapValueTypes);
    const sharedStringExtension = Sequence.SharedString.getFactory();

    const dataTypes = new Map<string, ISharedObjectExtension>();
    dataTypes.set(mapExtension.type, mapExtension);
    dataTypes.set(sharedStringExtension.type, sharedStringExtension);

    const runtime = await ComponentRuntime.load(context, dataTypes);
    const mathCollectionP = MathCollection.load(runtime, context);
    runtime.registerRequestHandler(async (request: IRequest) => {
        const mathCollection = await mathCollectionP;
        return mathCollection.request(request);
    });

    return runtime;
}
