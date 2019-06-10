import * as ClientUI from "@prague/client-ui";
import { ComponentRuntime } from "@prague/component-runtime";
import {
    IComponentRouter,
    IRequest,
    IResponse,
    ISharedComponent,
} from "@prague/container-definitions";
import {
    CounterValueType,
    DistributedSetValueType,
    ISharedMap,
    MapExtension,
    registerDefaultValueType,
} from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import {
    ComponentCursorDirection,
    ComponentDisplayType,
    IComponentCollection,
    IComponentContext,
    IComponentCursor,
    IComponentLayout,
    IComponentRenderHTML,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import * as Sequence from "@prague/sequence";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import { EventEmitter } from "events";
import * as Katex from "katex";

interface IMathMarkerInst extends ClientUI.controls.IMathMarker {
    instance?: MathInstance;
}

export class MathInstance extends EventEmitter
    implements ISharedComponent, IComponentRenderHTML, IComponentRouter, IComponentLayout,
    IComponentCursor, ClientUI.controls.ISearchMenuClient {

    public static supportedInterfaces = [
        "IComponentLoadable", "IComponentRouter", "IComponentCollection", "IComponentRenderHTML",
        "IComponentLayout", "IComponentCursor", "ISearchMenuClient"];

    public endMarker: IMathMarkerInst;
    public startMarker: MergeTree.Marker;
    public canInline = true;
    public cursorActive = false;
    public savedElm: HTMLElement;
    public searchMenuHost: ClientUI.controls.ISearchMenuHost;

    constructor(
        public url: string,
        public leafId: string,
        private readonly collection: MathCollection,
        inCombinedText = false) {
        super();
        this.initialize(inCombinedText);
    }

    public query(id: string): any {
        return MathInstance.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return MathInstance.supportedInterfaces;
    }

    // ISearchMenuClient
    public registerSearchMenuHost(host: ClientUI.controls.ISearchMenuHost) {
        this.searchMenuHost = host;
    }

    // IComponentCursor
    public enter(direction: ComponentCursorDirection) {
        this.cursorActive = true;
        if (direction === ComponentCursorDirection.Left) {
            this.endMarker.mathCursor = 0;
            this.endMarker.mathTokenIndex = 0;
        } else if (direction === ComponentCursorDirection.Right) {
            const mathText = this.getMathText();
            this.endMarker.mathCursor = mathText.length;
            this.endMarker.mathTokenIndex = this.endMarker.mathTokens.length;
        }
    }

    public leave(direction: ComponentCursorDirection) {
        this.cursorActive = false;
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

    public rev() {
        const mathMarker = this.endMarker;
        mathMarker.mathTokenIndex = ClientUI.controls.mathTokRev(mathMarker.mathTokenIndex,
            mathMarker.mathTokens);
        if (mathMarker.mathTokenIndex !== ClientUI.controls.Nope) {
            mathMarker.mathCursor = ClientUI.controls.posAtToken(mathMarker.mathTokenIndex, mathMarker.mathTokens);
        } else {
            mathMarker.mathCursor = 0;
            mathMarker.mathTokenIndex = 0;
            return true;
        }
    }

    public fwd() {
        const mathMarker = this.endMarker;
        mathMarker.mathTokenIndex = ClientUI.controls.mathTokFwd(mathMarker.mathTokenIndex,
            mathMarker.mathTokens);
        if (mathMarker.mathTokenIndex > mathMarker.mathTokens.length) {
            return true;
        } else if (mathMarker.mathTokenIndex === mathMarker.mathTokens.length) {
            const mathText = this.getMathText();
            mathMarker.mathCursor = mathText.length;
        } else {
            mathMarker.mathCursor = ClientUI.controls.posAtToken(mathMarker.mathTokenIndex, mathMarker.mathTokens);
        }
    }

    public remoteEdit(pos: number, len: number, isInsert: boolean) {
        const mathMarker = this.endMarker;
        let mathCursorNew = mathMarker.mathCursor;
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
        mathMarker.mathCursor = mathCursorNew;
        const mathText = this.collection.getText(this);
        mathMarker.mathText = mathText;
        mathMarker.mathTokens = ClientUI.controls.lexMath(mathText);
        mathMarker.mathTokenIndex = ClientUI.controls.tokenAtPos(mathCursorNew, mathMarker.mathTokens);
    }

    public postInsert() {
        const mathText = this.collection.getText(this);
        const mathMarker = this.endMarker;
        mathMarker.mathText = mathText;
        mathMarker.mathTokens = ClientUI.controls.lexMath(mathText);
        mathMarker.mathTokenIndex = ClientUI.controls.mathTokFwd(mathMarker.mathTokenIndex, mathMarker.mathTokens);
        mathMarker.mathCursor = ClientUI.controls.posAtToken(mathMarker.mathTokenIndex, mathMarker.mathTokens);
    }

    public onKeydown(e: KeyboardEvent) {
        if (e.keyCode === ClientUI.controls.KeyCode.backspace) {
            const mathMarker = this.endMarker;
            const toRemoveMath = ClientUI.controls.bksp(mathMarker);
            if (toRemoveMath) {
                this.collection.removeText(this, toRemoveMath.start, toRemoveMath.end);
            }
            const mathText = this.collection.getText(this);
            mathMarker.mathText = mathText;
            mathMarker.mathTokens = ClientUI.controls.lexMath(mathText);
            mathMarker.mathCursor = ClientUI.controls.posAtToken(mathMarker.mathTokenIndex, mathMarker.mathTokens);
            if (this.savedElm) {
                ClientUI.controls.clearSubtree(this.savedElm);
                this.render(this.savedElm, ComponentDisplayType.Inline);
            }
        }
    }

    public insertText(text: string) {
        this.collection.insertText(text, this.leafId, this.endMarker.mathCursor);
        if (this.savedElm) {
            ClientUI.controls.clearSubtree(this.savedElm);
            this.render(this.savedElm, ComponentDisplayType.Inline);
        }
    }

    public onKeypress(e: KeyboardEvent) {
        let toInsert: string;
        if (e.charCode === ClientUI.controls.CharacterCodes.backslash) {
            if (this.searchMenuHost) {
                this.searchMenuHost.showSearchMenu(ClientUI.controls.mathCmdTree, false, true,
                    (s, cmd) => {
                        let text = `\\${s}`;
                        if (cmd) {
                            text = (cmd as ClientUI.controls.IMathCommand).texString;
                        }
                        this.insertText(text);
                    });
            }
        } else {
            toInsert = ClientUI.controls.transformInputCode(e.charCode);
        }
        if (toInsert) {
            this.insertText(toInsert);
        } else {
            console.log(`unrecognized math input ${e.char}`);
        }
    }

    public render(elm: HTMLElement, displayType: ComponentDisplayType) {
        this.savedElm = elm;
        const span = document.createElement("span");
        const mathText = this.getMathText();
        let mathBuffer = mathText;
        const mathMarker = this.endMarker;
        span.style.marginLeft = "2px";
        span.style.marginTop = "4px";
        span.style.marginRight = "2px";
        if (mathMarker.mathTokens === undefined) {
            ClientUI.controls.initMathMarker(mathMarker, mathText);
        }
        if (this.cursorActive) {
            span.style.borderLeft = "solid orange 2px";
            span.style.borderRight = "solid orange 2px";
            // showCursor
            mathBuffer = mathBuffer.substring(0, mathMarker.mathCursor) +
                ClientUI.controls.cursorTex +
                mathBuffer.substring(mathMarker.mathCursor);
            mathBuffer = ClientUI.controls.boxEmptyParam(mathBuffer);
        }
        mathMarker.mathViewBuffer = mathBuffer;
        Katex.render(mathBuffer, span,
            { throwOnError: false });
        if (this.cursorActive) {
            const cursorElement = ClientUI.controls.findFirstMatch(span, (cursor: HTMLElement) => {
                return cursor.style && (cursor.style.color === ClientUI.controls.cursorColor);
            });
            if (cursorElement) {
                cursorElement.classList.add("blinking");
            }
        }
        elm.appendChild(span);
    }

    private getMathText() {
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

export class MathCollection extends EventEmitter implements ISharedComponent, IComponentCollection, IComponentRouter {
    public static supportedInterfaces = ["IComponentLoadable", "IComponentRouter",
        "IComponentCollection"];

    public static async Load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new MathCollection(runtime, context);
        await collection.initialize();

        return collection;
    }

    public url: string;

    private root: ISharedMap;
    private combinedMathText: Sequence.SharedString;

    constructor(private readonly runtime: IComponentRuntime, context: IComponentContext) {
        super();

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
                [MergeTree.reservedTileLabelsKey]: ["math"],
                [MergeTree.reservedMarkerIdKey]: endId,
                mathEnd: true,
            });
        }
        let seg = this.combinedMathText.client.mergeTree.getSegmentFromId(endId);
        const mathMarker = seg as ClientUI.controls.IMathMarker;
        instance.endMarker = mathMarker;
        seg = this.combinedMathText.client.mergeTree.getSegmentFromId(instance.leafId);
        instance.startMarker = seg as MergeTree.Marker;
        mathMarker.mathTokenIndex = 0;
        mathMarker.mathTokens = [] as ClientUI.controls.MathToken[];
        mathMarker.mathCursor = 0;
        mathMarker.mathText = this.getText(instance);
        mathMarker.mathTokens = ClientUI.controls.lexMath(mathMarker.mathText);
    }

    public create(): MathInstance {
        const leafId = `math-${Date.now()}`;
        return new MathInstance(`${this.url}/${leafId}`, leafId, this);
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

    public getInstance(id: string) {
        const endId = endIdPrefix + id;
        const mathMarker = this.combinedMathText.client.mergeTree.getSegmentFromId(endId) as IMathMarkerInst;
        if (mathMarker !== undefined) {
            if (!mathMarker.instance) {
                mathMarker.instance = new MathInstance(`${this.url}/${id}`, id, this, true);
            }
            return mathMarker.instance;
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
            this.root = this.runtime.createChannel("root", MapExtension.Type) as ISharedMap;
            this.combinedMathText = this.runtime.createChannel("mathText", Sequence.SharedStringExtension.Type) as Sequence.SharedString;
            this.root.attach();
            this.combinedMathText.attach();
        } else {
            this.root = await this.runtime.getChannel("root") as ISharedMap;
            this.combinedMathText = await this.runtime.getChannel("mathText") as Sequence.SharedString;
        }
        this.combinedMathText.on("sequenceDelta", (event, target) => {
            if ((!event.isLocal) && (event.ranges.length > 0) && (event.clientId !== "original")) {
                let pos: number;
                let len = 0;
                event.ranges.forEach((range) => {
                    pos = range.offset;
                    len += range.segment.cachedLength;
                });
                console.log(`got event from ${event.clientId} pos: ${pos}`);
                const tileInfo = this.findTile(pos, "math", false);
                if (tileInfo && (tileInfo.tile.properties.mathEnd)) {
                    const mathMarker = tileInfo.tile as IMathMarkerInst;
                    const leafId = mathMarker.getId().substring(endIdPrefix.length);
                    const instance = this.getInstance(leafId);
                    const startPos = this.getStartPos(instance);
                    instance.remoteEdit(pos - startPos, len, event.deltaOperation === MergeTree.MergeTreeDeltaType.INSERT);
                    console.log(`found math remote ${leafId} instance ${instance !== undefined}`);
                    if (instance.savedElm) {
                        console.log("rendering");
                        ClientUI.controls.clearSubtree(instance.savedElm);
                        instance.render(instance.savedElm, ComponentDisplayType.Inline);
                    }
                }

            }
        });

    }
}

export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    // Register default map value types
    registerDefaultValueType(new DistributedSetValueType());
    registerDefaultValueType(new CounterValueType());
    registerDefaultValueType(new Sequence.SharedStringIntervalCollectionValueType());
    registerDefaultValueType(new Sequence.SharedIntervalCollectionValueType());

    const mapExtension = new MapExtension();
    const sharedStringExtension = new Sequence.SharedStringExtension();

    const dataTypes = new Map<string, ISharedObjectExtension>();
    dataTypes.set(mapExtension.type, mapExtension);
    dataTypes.set(sharedStringExtension.type, sharedStringExtension);

    const runtime = await ComponentRuntime.Load(context, dataTypes);
    const mathCollectionP = MathCollection.Load(runtime, context);
    runtime.registerRequestHandler(async (request: IRequest) => {
        const mathCollection = await mathCollectionP;
        return mathCollection.request(request);
    });

    return runtime;
}
