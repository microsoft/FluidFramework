/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentLoadable,
    IComponentRouter,
    IRequest,
    IResponse,
    IComponentHTMLOptions,
    IComponentHTMLVisual,
    IComponentHandle,
    IComponent,
    IComponentHTMLView,
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime } from "@microsoft/fluid-component-runtime";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import { MergeTreeDeltaType, TextSegment, ReferenceType, reservedTileLabelsKey, Marker } from "@microsoft/fluid-merge-tree";
import { IComponentContext, IComponentFactory, IComponentRuntime, IInboundSignalMessage } from "@microsoft/fluid-runtime-definitions";
import { SharedString, SequenceDeltaEvent } from "@microsoft/fluid-sequence";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import * as CodeMirror from "codemirror";
import { EventEmitter } from "events";

require("codemirror/lib/codemirror.css");
require("./style.css");

require("codemirror/mode/javascript/javascript.js");

interface IPresenceInfo {
    userId: string;
    color: IColor;
    location: {
        anchor: CodeMirror.Position;
        head: CodeMirror.Position;
    }[];
}

interface IColor {
    name: string;
    rgb: {
        r: number;
        g: number;
        b: number;
    };
}

/**
 * This should be super generic and only do really generic things.
 * This will only take a dependency on the runtime.
 */
class PresenceManager extends EventEmitter {
    private presenceKey: string;
    private presenceMap: Map<string, IPresenceInfo> = new Map();

    public constructor(private runtime: IComponentRuntime) {
        super();
        this.presenceKey = `presence-${runtime.id}`;

        runtime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
            // only process presence keys that are not local while we are connected
            if (message.type === this.presenceKey && !local && runtime.connected) {
                console.log(`received new presence signal: ${JSON.stringify(message)}`);
                const presenceInfo = {
                    userId: message.clientId,
                    color: this.getColor(message.clientId),
                    location: message.content,
                };
                this.presenceMap.set(message.clientId, presenceInfo);
                this.emit("newPresence", presenceInfo);
            }
        });
    }

    public send(location: {}) { 
        if (this.runtime.connected) {
            console.log(`sending new presence signal: ${JSON.stringify(location)}`);  
            this.runtime.submitSignal(this.presenceKey, location);
        }
    }

    private getColor(id: string): IColor  {
        let sum = 0;
        for (let i = 0; i < id.length; i++) {
            sum += id[i].charCodeAt(0);
        }

        const colorMap: IColor[] = [
            {
                name: "blue",
                rgb: {
                    r: 0,
                    g: 0,
                    b: 255,
                }
            },
            {
                name: "green",
                rgb: {
                    r: 0,
                    g: 255,
                    b: 0,
                }
            },
            {
                name: "blue",
                rgb: {
                    r: 255,
                    g: 0,
                    b: 0,
                }
            },
        ];

        return colorMap[sum % colorMap.length];
    }
}

/**
 * This will be the codemirror specific implementation
 */
class CodeMirrorPresenceManager extends EventEmitter {
    private presenceManager: PresenceManager;
    private lastMarker:CodeMirror.TextMarker;
    private lastWidget: HTMLSpanElement;
    // private presenceMap: Map<string, {}> = new Map();

    private get doc(): CodeMirror.Doc {
        return this.codeMirror.getDoc();
    }

    public constructor(private codeMirror: CodeMirror.EditorFromTextArea, runtime: IComponentRuntime) {
        super();
        this.presenceManager = new PresenceManager(runtime);
        this.codeMirror.on(
            'cursorActivity',
            (instance: CodeMirror.Editor) => {
                const selection = this.doc.listSelections();
                console.log(selection)
                this.presenceManager.send(selection);
            });
        
        this.presenceManager.on("newPresence", (presenceInfo: IPresenceInfo) => {
            if (this.lastMarker){
                this.lastMarker.clear();
            }
            if (this.lastWidget){
                this.lastWidget.remove();
            }

            // Selection highlighting
            const style = {
                css: `background-color: rgba(${presenceInfo.color.rgb.r}, ${presenceInfo.color.rgb.g}, ${presenceInfo.color.rgb.b}, 0.3)`,
            };

            presenceInfo.location.forEach(range => {
                const head = this.doc.indexFromPos(range.head);
                const anchor = this.doc.indexFromPos(range.anchor);
                if (head > anchor) {
                    this.lastMarker = this.doc.markText(range.anchor, range.head, style);
                } else {
                    this.lastMarker = this.doc.markText(range.head, range.anchor, style);
                }
            });

            // Cursor positioning
            const widget = document.createElement("span");
            widget.id = `cursor-${presenceInfo.userId}`;
            widget.style.width = "1px";
            widget.style.backgroundColor = `rgb(${presenceInfo.color.rgb.r}, ${presenceInfo.color.rgb.g}, ${presenceInfo.color.rgb.b})`;
            widget.style.height = "15px";
            widget.style.marginTop = "-15px";

            const dot = document.createElement("span");
            dot.style.height = "4px";
            dot.style.width = "4px";
            dot.style.backgroundColor = `rgb(${presenceInfo.color.rgb.r}, ${presenceInfo.color.rgb.g}, ${presenceInfo.color.rgb.b})`;
            dot.style.borderRadius = "50%";
            dot.style.position = "absolute";
            dot.style.marginTop = "-2px";
            widget.appendChild(dot);
            
            this.lastWidget = widget;

            this.codeMirror.addWidget(presenceInfo.location[0].head, widget, true);
        });
    }
}

class CodemirrorView implements IComponentHTMLView {
    private textArea: HTMLTextAreaElement;
    private codeMirror: CodeMirror.EditorFromTextArea;
    private presenceManager : CodeMirrorPresenceManager;
    
    // TODO would be nice to be able to distinguish local edits across different uses of a sequence so that when
    // bridging to another model we know which one to update
    private updatingSequence: boolean;
    private updatingCodeMirror: boolean;

    private sequenceDeltaCb: any;

    constructor(private text: SharedString, private runtime: IComponentRuntime) {
    }

    public remove(): void {
        // text area being removed will dispose of CM
        // https://stackoverflow.com/questions/18828658/how-to-kill-a-codemirror-instance

        if (this.sequenceDeltaCb) {
            this.text.removeListener("sequenceDelta", this.sequenceDeltaCb);
            this.sequenceDeltaCb = undefined;
        }

        if (this.presenceManager) {
            this.presenceManager.removeAllListeners();
            this.presenceManager = undefined;
        }
    }
    
    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        // create base textarea
        if (!this.textArea) {
            this.textArea = document.createElement("textarea");
        }

        // reparent if needed
        if (this.textArea.parentElement !== elm) {
            this.textArea.remove();
            elm.appendChild(this.textArea);
        }

        if (!this.codeMirror) {
            this.setupEditor();
        }
    }

    private setupEditor() {
        this.codeMirror = CodeMirror.fromTextArea(
            this.textArea,
            {
                lineNumbers: true,
                mode: "text/typescript",
                viewportMargin: Infinity,
            });
        
        this.presenceManager = new CodeMirrorPresenceManager(this.codeMirror, this.runtime);

        const { parallelText } = this.text.getTextAndMarkers("pg");
        const text = parallelText.join("\n");
        this.codeMirror.setValue(text);

        this.codeMirror.on(
            "beforeChange",
            (instance, changeObj) => {
                // Ignore this callback if it is a local change
                if (this.updatingSequence) {
                    return;
                }

                // mark that our editor is making the edit
                this.updatingCodeMirror = true;

                const doc = instance.getDoc();

                // we add in line to adjust for paragraph markers
                let from = doc.indexFromPos(changeObj.from);
                const to = doc.indexFromPos(changeObj.to);

                if (from !== to) {
                    this.text.removeText(from, to);
                }

                const text = changeObj.text as string[];
                text.forEach((value, index) => {
                    // Insert the updated text
                    if (value) {
                        this.text.insertText(from, value);
                        from += value.length;
                    }

                    // Add in a paragraph marker if this is a multi-line update
                    if (index !== text.length - 1) {
                        this.text.insertMarker(
                            from,
                            ReferenceType.Tile,
                            { [reservedTileLabelsKey]: ["pg"] });
                        from++;
                    }
                });

                this.updatingCodeMirror = false;
            });

        this.sequenceDeltaCb = (ev: SequenceDeltaEvent) => {
            // If in the middle of making an editor change to our instance we can skip this update
            if (this.updatingCodeMirror) {
                return;
            }

            // mark that we are making a local edit so that when "beforeChange" fires we don't attempt
            // to submit new ops
            this.updatingSequence = true;
    
            const doc = this.codeMirror.getDoc();
            for (const range of ev.ranges) {
                const segment = range.segment;
    
                if (range.operation === MergeTreeDeltaType.INSERT) {
                    if (TextSegment.is(segment)) {
                        doc.replaceRange(
                            segment.text,
                            doc.posFromIndex(range.position));
                    } else if (Marker.is(segment)) {
                        doc.replaceRange(
                            "\n",
                            doc.posFromIndex(range.position));
                    }
                } else if (range.operation === MergeTreeDeltaType.REMOVE) {
                    if (TextSegment.is(segment)) {
                        const textSegment = range.segment as TextSegment;
                        doc.replaceRange(
                            "",
                            doc.posFromIndex(range.position),
                            doc.posFromIndex(range.position + textSegment.text.length));
                    } else if (Marker.is(segment)) {
                        doc.replaceRange(
                            "",
                            doc.posFromIndex(range.position),
                            doc.posFromIndex(range.position + 1));
                    }
                }
            }
    
            // and then flip the bit back since we are done making codemirror changes
            this.updatingSequence = false;
        }

        this.text.on("sequenceDelta", this.sequenceDeltaCb);
    }
}

export class CodeMirrorComponent
    extends EventEmitter
    implements IComponentLoadable, IComponentRouter, IComponentHTMLVisual {

    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new CodeMirrorComponent(runtime, context);
        await collection.initialize();

        return collection;
    }

    public get IComponentLoadable() { return this; }
    public get IComponentRouter() { return this; }
    public get IComponentHTMLVisual() { return this; }

    public url: string;
    private text: SharedString;
    private root: ISharedMap;

    private defaultView: CodemirrorView;

    constructor(
        private runtime: IComponentRuntime,
        /* private */ context: IComponentContext,
    ) {
        super();
        this.url = context.id;
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/component",
            status: 200,
            value: this,
        };
    }

    private async initialize() {
        if (!this.runtime.existing) {
            this.root = SharedMap.create(this.runtime, "root");
            const text = SharedString.create(this.runtime);

            // initial paragraph marker
            text.insertMarker(
                0,
                ReferenceType.Tile,
                { [reservedTileLabelsKey]: ["pg"] });

            this.root.set("text", text.handle);
            this.root.register();
        }

        this.root = await this.runtime.getChannel("root") as ISharedMap;
        this.text = await this.root.get<IComponentHandle>("text").get<SharedString>();
    }

    public addView(scope: IComponent): IComponentHTMLView {
        return new CodemirrorView(this.text, this.runtime);
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        if (!this.defaultView) {
            this.defaultView = new CodemirrorView(this.text, this.runtime);
        }

        this.defaultView.render(elm, options);
    }
}

class SmdeFactory implements IComponentFactory {
    public get IComponentFactory() { return this; }

    public instantiateComponent(context: IComponentContext): void {
        const dataTypes = new Map<string, ISharedObjectFactory>();
        const mapFactory = SharedMap.getFactory();
        const sequenceFactory = SharedString.getFactory();

        dataTypes.set(mapFactory.type, mapFactory);
        dataTypes.set(sequenceFactory.type, sequenceFactory);

        ComponentRuntime.load(
            context,
            dataTypes,
            (runtime) => {
                const progressCollectionP = CodeMirrorComponent.load(runtime, context);
                runtime.registerRequestHandler(async (request: IRequest) => {
                    const progressCollection = await progressCollectionP;
                    return progressCollection.request(request);
                });
            });
    }
}

export const fluidExport = new SmdeFactory();
