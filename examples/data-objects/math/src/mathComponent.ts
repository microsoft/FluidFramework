/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as ClientUI from "@fluid-example/client-ui-lib";
import { Caret, CaretEventType, Direction, ICaretEvent } from "@fluid-example/flow-util-lib";
import * as SearchMenu from "@fluid-example/search-menu";
import {
    IFluidObject,
    IFluidHandleContext,
    IFluidLoadable,
    IFluidRouter,
    IRequest,
    IResponse,
    IFluidHandle,
} from "@fluidframework/core-interfaces";
import { FluidObjectHandle } from "@fluidframework/datastore";
import { SharedDirectory, ISharedDirectory } from "@fluidframework/map";
import * as MergeTree from "@fluidframework/merge-tree";
import { IFluidDataStoreContext, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import * as Sequence from "@fluidframework/sequence";
import { LazyLoadedDataObjectFactory, LazyLoadedDataObject } from "@fluidframework/data-object-base";
import { IFluidHTMLOptions, IFluidHTMLView } from "@fluidframework/view-interfaces";
import * as Katex from "katex";
import * as MathExpr from "./mathExpr";

const directionToCursorDirection = {
    [Direction.left]: ClientUI.controls.CursorDirection.Left,
    [Direction.right]: ClientUI.controls.CursorDirection.Right,
    [Direction.up]: ClientUI.controls.CursorDirection.Up,
    [Direction.down]: ClientUI.controls.CursorDirection.Down,
    [Direction.none]: ClientUI.controls.CursorDirection.Airlift,
};

const cursorDirectionToDirection = {
    [ClientUI.controls.CursorDirection.Left]: Direction.left,
    [ClientUI.controls.CursorDirection.Right]: Direction.right,
    [ClientUI.controls.CursorDirection.Up]: Direction.up,
    [ClientUI.controls.CursorDirection.Down]: Direction.down,
    [ClientUI.controls.CursorDirection.Airlift]: Direction.none,
};

type IMathMarkerInst = MathExpr.IMathMarker;

export class MathView implements IFluidHTMLView, ClientUI.controls.IViewCursor, ClientUI.controls.IViewLayout {
    public get IFluidHTMLView() { return this; }
    public get IViewCursor() { return this; }
    public get IViewLayout() { return this; }

    public cursorActive = false;
    public cursorElement: HTMLElement;
    // IViewLayout
    public canInline = true;
    public containerElement: HTMLElement;
    public mathCursor = 0;
    public mathTokenIndex = 0;
    public searchMenuHost: SearchMenu.ISearchMenuHost;
    public options?: IFluidHTMLOptions;
    public rootElement: HTMLElement;

    constructor(public instance: MathInstance, scope?: IFluidObject) {
        if (scope) {
            this.searchMenuHost = scope.ISearchMenuHost;
        }
        this.options = this.instance.options;
        this.instance.on("remoteEdit", this.remoteEdit);
    }

    // IFluidHTMLView
    public render(containerElement: HTMLElement, options?: IFluidHTMLOptions) {
        if (options) {
            this.options = options;
        }
        this.buildTree(containerElement, this.options.display);
    }

    public remove() {
        this.instance.off("remoteEdit", this.remoteEdit);
    }

    public remoteEdit = (pos: number, len: number, isInsert: boolean) => {
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
    };

    // IViewCursor
    public enter(direction: ClientUI.controls.CursorDirection) {
        console.log(`enter: ${ClientUI.controls.CursorDirection[direction]}`);
        this.cursorActive = true;
        if (direction === ClientUI.controls.CursorDirection.Right) {
            this.mathCursor = 0;
            this.mathTokenIndex = 0;
        } else if (direction === ClientUI.controls.CursorDirection.Left) {
            const mathText = this.instance.getMathText();
            this.mathCursor = mathText.length;
            this.mathTokenIndex = this.instance.endMarker.mathTokens.length;
        }
    }

    public leave(direction: ClientUI.controls.CursorDirection) {
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
            this.noteCursorExit(ClientUI.controls.CursorDirection.Left);
            return true;
        }
    }

    public fwd() {
        const mathMarker = this.instance.endMarker;
        this.mathTokenIndex = MathExpr.mathTokFwd(this.mathTokenIndex,
            mathMarker.mathTokens);
        if (this.mathTokenIndex > mathMarker.mathTokens.length) {
            this.noteCursorExit(ClientUI.controls.CursorDirection.Right);
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
            this.enter(ClientUI.controls.CursorDirection.Focus);
            this.localRender();
        });
        this.containerElement.addEventListener("blur", () => {
            this.leave(ClientUI.controls.CursorDirection.Focus);
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
            console.log(`caret event ${ClientUI.controls.CursorDirection[cursorDirection]}`);
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

    public buildAligned(mathLines: string[], checks: boolean[]) {
        let mathBuffer = "\\begin{darray}{rcllcr} \n";
        let count = 1;
        for (let i = 0; i < mathLines.length; i++) {
            let line = mathLines[i];
            if (line.includes("=")) {
                line = line.replace("=", "& = &");
            } else {
                line = `& ${line} &`;
            }
            let rightContext = "\\hspace{20ex}";
            if (checks[i]) {
                rightContext += "\\textcolor{#008000}{\\checkmark}";
            }
            mathBuffer += `${line} & & ${rightContext} & \\textrm{(${count++})} \\\\ \n`;
        }
        mathBuffer += "\\end{darray}";
        return mathBuffer;
    }

    public buildTree(elm: HTMLElement, display?: string) {
        let _display = display;
        if (this.containerElement !== elm) {
            this.containerElement = elm;
            this.setListeners();
        }
        if (_display === undefined) {
            _display = this.options.display;
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
        if (_display === "inline") {
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
            const checkSoln = true;
            const checks = [] as boolean[];
            rootElement = document.createElement("div");
            const cleanMathLines = mathBuffer.split("\n");
            for (let i = 0; i < cleanMathLines.length; i++) {
                const cleanLine = cleanMathLines[i];
                if (checkSoln) {
                    try {
                        checks[i] = MathExpr.matchSolution(cleanLine, this.instance.solnVar,
                            this.instance.solnText);
                    } catch (e) {
                        console.log(`match soln: ${cleanLine}`);
                        checks[i] = false;
                    }
                } else {
                    checks[i] = false;
                }
            }
            if (this.cursorActive) {
                // showCursor
                mathBuffer = mathBuffer.substring(0, this.mathCursor) +
                    MathExpr.cursorTex +
                    mathBuffer.substring(this.mathCursor);
                mathBuffer = MathExpr.boxEmptyParam(mathBuffer);
            }
            const mathLines = mathBuffer.split("\n");
            if (useDarray) {
                mathBuffer = this.buildAligned(mathLines, checks);
                Katex.render(mathBuffer, rootElement,
                    { throwOnError: false, displayMode: true });
            } else {
                this.buildAlignedAsDiv(mathLines, rootElement);
            }
        }
        if (this.cursorActive) {
            const cursorElement = ClientUI.controls.findFirstMatch(rootElement,
                (cursor: HTMLElement) => cursor.style && (cursor.style.color === MathExpr.cursorColor));
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
                this.leave(ClientUI.controls.CursorDirection.Right);
            }
            this.localRender();
        } else if (e.keyCode === ClientUI.controls.KeyCode.leftArrow) {
            if (this.rev()) {
                this.leave(ClientUI.controls.CursorDirection.Left);
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

    public specialCommand(cmd: string) {
        console.log(`special command ${cmd}`);
        if (cmd.startsWith("solution ")) {
            this.instance.solnText = cmd.substring(9);
            const v = MathExpr.extractFirstVar(this.instance.solnText);
            if (v) {
                this.instance.solnVar = v.text;
            }
        }
    }

    public onKeypress(e: KeyboardEvent) {
        if (e.charCode === ClientUI.controls.CharacterCodes.backslash) {
            if (this.searchMenuHost) {
                this.searchMenuHost.showSearchMenu(MathExpr.mathCmdTree, false, true,
                    (s, cmd) => {
                        if (cmd) {
                            const text = (cmd as MathExpr.IMathCommand).texString;
                            this.insertText(text);
                        } else {
                            this.specialCommand(s);
                        }
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

    private noteCursorExit(direction: ClientUI.controls.CursorDirection) {
        const cursorElement = ClientUI.controls.findFirstMatch(this.containerElement, (cursor: HTMLElement) => {
            return cursor.style && (cursor.style.color === MathExpr.cursorColor);
        }) || this.containerElement;

        Caret.caretLeave(this.containerElement, cursorDirectionToDirection[direction], cursorElement.getBoundingClientRect());
    }
}

export class MathInstance extends EventEmitter implements IFluidLoadable, IFluidRouter {
    public static defaultOptions: IMathOptions = { display: "inline" };

    public get IFluidLoadable() { return this; }
    public get IFluidRouter() { return this; }

    public handle: FluidObjectHandle;
    public endMarker: IMathMarkerInst;
    public startMarker: MergeTree.Marker;
    public solnText = "x=0";
    public solnVar = "x";

    constructor(
        public leafId: string,
        context: IFluidHandleContext,
        public readonly collection: MathCollection,
        public readonly options = MathInstance.defaultOptions,
        inCombinedText = false,
    ) {
        super();
        this.handle = new FluidObjectHandle(this, leafId, context);
        this.initialize(inCombinedText);
    }

    public insertText(text: string, pos: number) {
        this.collection.insertText(text, this.leafId, pos);
    }

    public removeText(startPos: number, endPos: number) {
        this.collection.removeText(this, startPos, endPos);
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/object",
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
        this.emit("remoteEdit", pos, len, isInsert);
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

function getPosition(sharedString: Sequence.SharedString, segment: MergeTree.ISegment) {
    return sharedString.getPosition(segment);
}

const endIdPrefix = "end-";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IMathOptions extends IFluidHTMLOptions { }

export class MathCollection extends LazyLoadedDataObject<ISharedDirectory> {
    private static readonly factory = new LazyLoadedDataObjectFactory<MathCollection>(
        "@fluid-example/math",
        MathCollection,
        /* root: */ SharedDirectory.getFactory(),
        [Sequence.SharedString.getFactory()],
    );

    public static getFactory(): IFluidDataStoreFactory { return MathCollection.factory; }

    public static async create(parentContext: IFluidDataStoreContext, props?: any) {
        return MathCollection.factory.create(parentContext, props);
    }

    public create() {
        this.combinedMathText = Sequence.SharedString.create(this.runtime, "mathText");
        this.root.set("mathText", this.combinedMathText.handle);
        this.initialize();
    }

    public async load() {
        this.combinedMathText = await (await this.root.wait<IFluidHandle<Sequence.SharedString>>("mathText")).get();
        this.initialize();
    }

    public get IFluidLoadable() { return this; }
    public get IFluidRouter() { return this; }

    private combinedMathText: Sequence.SharedString;

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
        let seg = this.combinedMathText.getMarkerFromId(endId);
        const mathMarker = seg as MathExpr.IMathMarker;
        instance.endMarker = mathMarker;
        mathMarker.mathInstance = instance;
        seg = this.combinedMathText.getMarkerFromId(instance.leafId);
        instance.startMarker = seg as MergeTree.Marker;
        mathMarker.mathText = this.getText(instance);
        mathMarker.mathTokens = MathExpr.lexMath(mathMarker.mathText);
    }

    public createCollectionItem(options?: IMathOptions): MathInstance {
        const leafId = `math-${Date.now()}`;
        return new MathInstance(leafId, this.runtime.objectsRoutingContext, this, options);
    }

    public getText(instance: MathInstance) {
        const sharedString = this.combinedMathText;
        const startMarker = instance.startMarker;
        const start = getPosition(sharedString, startMarker) + startMarker.cachedLength;
        const endMarker = instance.endMarker;
        const end = getPosition(sharedString, endMarker);
        return this.combinedMathText.getText(start, end);
    }

    public removeCollectionItem(instance: MathInstance) {
        const sharedString = this.combinedMathText;
        const startMarker = instance.startMarker;
        const start = getPosition(sharedString, startMarker);
        const endMarker = instance.endMarker;
        const end = getPosition(sharedString, endMarker) + endMarker.cachedLength;
        this.combinedMathText.removeRange(start, end);
    }

    public async request(request: IRequest): Promise<IResponse> {
        // Trim leading slash, if it exists
        const trimmedUrl = request.url.startsWith("/") ? request.url.substr(1) : request.url;

        // Next segment is math instance id, if it exists
        const instanceId = trimmedUrl
            .substr(0, !trimmedUrl.includes("/", 1) ? trimmedUrl.length : trimmedUrl.indexOf("/"));

        // If no instance is requested, then the collection itself is being requested
        if (!instanceId) {
            return {
                mimeType: "fluid/object",
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
        this.combinedMathText.insertText(pos, text);
        instance.postInsert();
    }

    public removeText(instance: MathInstance, start: number, end: number) {
        const startPos = this.getStartPos(instance);
        this.combinedMathText.removeRange(startPos + start, startPos + end);
    }

    public getInstance(id: string, options = MathInstance.defaultOptions) {
        let _options = options;
        const endId = endIdPrefix + id;
        const mathMarker = this.combinedMathText.getMarkerFromId(endId) as IMathMarkerInst;
        if (mathMarker !== undefined) {
            if (!mathMarker.mathInstance) {
                if (mathMarker.properties.componentOptions) {
                    _options = mathMarker.properties.componentOptions;
                }
                mathMarker.mathInstance = new MathInstance(id, this.runtime.objectsRoutingContext, this, _options, true);
            }
            return mathMarker.mathInstance as MathInstance;
        }
    }

    private getStartPos(instance: MathInstance) {
        const sharedString = this.combinedMathText;
        const startMarker = instance.startMarker;
        const start = getPosition(sharedString, startMarker);
        return start + startMarker.cachedLength;
    }

    private findTile(startPos: number, tileType: string, preceding: boolean) {
        return this.combinedMathText.findTile(startPos, tileType, preceding);
    }

    private initialize() {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, import/no-internal-modules, import/no-unassigned-import
        require("katex/dist/katex.min.css");
        // eslint-disable-next-line @typescript-eslint/no-require-imports, import/no-unassigned-import
        require("./index.css");

        this.combinedMathText.on("sequenceDelta", (event) => {
            if ((!event.isLocal) && (event.ranges.length > 0) && (event.clientId !== "original")) {
                let pos: number;
                let len = 0;
                event.ranges.forEach((range) => {
                    pos = range.position;
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

export const fluidExport: IFluidDataStoreFactory = MathCollection.getFactory();
