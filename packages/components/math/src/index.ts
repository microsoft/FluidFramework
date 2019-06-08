import * as ClientUI from "@prague/client-ui";
import { ComponentRuntime } from "@prague/component-runtime";
import {
    IPlatform,
    IRequest,
    IResponse,
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
    ComponentDisplayType,
    IComponent,
    IComponentCollection,
    IComponentContext,
    IComponentLayout,
    IComponentRenderHTML,
    IComponentRouter,
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
    implements IComponent, IPlatform, IComponentRenderHTML, IComponentRouter, IComponentLayout {
    public endMarker: IMathMarkerInst;
    public startMarker: MergeTree.Marker;
    public canInline = true;
    public cursorActive = false;

    constructor(
        public id: string,
        public leafId: string,
        private readonly collection: MathCollection) {
        super();
        this.initialize();
    }

    // On attach create a specific binding from the model to the platform
    public async attach(platform: IPlatform): Promise<IPlatform> {
        return this;
    }

    public async queryInterface<T>(name: string): Promise<any> {
        switch (name) {
            case "IComponentLayout":
            case "IComponentRenderHTML":
            case "IComponentRouter":
                return this;
            default:
                return undefined;
        }
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

    public cursorVisible(v: boolean) {
        this.cursorActive = v;
    }

    public cursorFwd() {
        const mathMarker = this.endMarker;
        mathMarker.mathTokenIndex = ClientUI.controls.mathTokFwd(mathMarker.mathTokenIndex,
            mathMarker.mathTokens);
        ClientUI.controls.printMathMarker(mathMarker);
        if (mathMarker.mathTokenIndex > mathMarker.mathTokens.length) {
            return true;
        } else if (mathMarker.mathTokenIndex === mathMarker.mathTokens.length) {
            const mathText = this.getMathText();
            mathMarker.mathCursor = mathText.length;
        } else {
            mathMarker.mathCursor = ClientUI.controls.posAtToken(mathMarker.mathTokenIndex, mathMarker.mathTokens);
        }
    }

    public render(elm: HTMLElement, displayType: ComponentDisplayType) {
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

    private initialize() {
        const markers = this.collection.appendMathMarkers(this.leafId);
        this.endMarker = markers.end;
        this.startMarker = markers.start as MergeTree.Marker;
        this.endMarker.instance = this;
    }
}

function getOffset(client: MergeTree.Client, segment: MergeTree.ISegment) {
    return client.mergeTree.getOffset(segment, MergeTree.UniversalSequenceNumber, client.getClientId());
}

const endIdPrefix = "end-";

export class MathCollection extends EventEmitter implements IComponent, IComponentCollection, IComponentRouter, IPlatform {
    public static async Load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new MathCollection(runtime, context);
        await collection.initialize();

        return collection;
    }

    public id: string;
    private root: ISharedMap;
    private combinedMathText: Sequence.SharedString;

    constructor(private readonly runtime: IComponentRuntime, context: IComponentContext) {
        super();

        this.id = context.id;
    }

    public async queryInterface<T>(id: string): Promise<any> {
        switch (id) {
            case "IComponentCollection":
            case "IComponentRouter":
                return this;
            default:
                return undefined;
        }
    }

    public detach() {
        return;
    }

    public async attach(platform: IPlatform): Promise<IPlatform> {
        return this;
    }

    public appendMathMarkers(id: string) {
        let pos = this.combinedMathText.getLength();
        this.combinedMathText.insertMarker(pos++, MergeTree.ReferenceType.Tile, {
            [MergeTree.reservedTileLabelsKey]: ["math"],
            [MergeTree.reservedMarkerIdKey]: id,
            mathStart: true,
        });
        const endId = endIdPrefix + id;
        this.combinedMathText.insertMarker(pos, MergeTree.ReferenceType.Tile, {
            [MergeTree.reservedTileLabelsKey]: ["math"],
            [MergeTree.reservedMarkerIdKey]: endId,
            mathEnd: true,
        });
        const seg = this.combinedMathText.client.mergeTree.getSegmentFromId(endId);
        const mathMarker = seg as ClientUI.controls.IMathMarker;
        mathMarker.mathTokenIndex = 0;
        mathMarker.mathTokens = [] as ClientUI.controls.MathToken[];
        mathMarker.mathCursor = 0;
        // for now, put in some math since we aren't editing yet
        mathMarker.mathText = "x^{2}";
        mathMarker.mathTokens = ClientUI.controls.lexMath(mathMarker.mathText);
        ClientUI.controls.printMathMarker(mathMarker);
        this.combinedMathText.insertTextRelative({ id }, mathMarker.mathText);
        return { end: mathMarker, start: this.combinedMathText.client.mergeTree.getSegmentFromId(id) };
    }

    public create(): MathInstance {
        const leafId = `math-${Date.now()}`;
        return new MathInstance(`${this.id}/${leafId}`, leafId, this);
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
        const instanceId = request.url.substr(1);

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

    public getInstance(id: string) {
        const endId = endIdPrefix + id;
        const mathMarker = this.combinedMathText.client.mergeTree.getSegmentFromId(endId) as IMathMarkerInst;
        if (mathMarker !== undefined) {
            if (!mathMarker.instance) {
                mathMarker.instance = new MathInstance(`${this.id}/${id}`, id, this);
            }
            return mathMarker.instance;
        }
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
        // NEXT load math from shared string as needed
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
