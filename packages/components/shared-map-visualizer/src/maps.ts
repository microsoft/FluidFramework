/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentHTMLOptions,
    IComponentHTMLVisual,
    IComponentLoadable,
    IComponentRouter,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime } from "@microsoft/fluid-component-runtime";
import { IContainerContext, IRuntime, IRuntimeFactory } from "@microsoft/fluid-container-definitions";
import { ContainerRuntime } from "@microsoft/fluid-container-runtime";
import { Counter, CounterValueType, ISharedMap, IValueChanged, SharedMap } from "@microsoft/fluid-map";
import {
    FlushMode,
    IComponentContext,
    IComponentFactory,
    IComponentRuntime,
    IHostRuntime,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { EventEmitter } from "events";
import * as $ from "jquery";

// tslint:disable-next-line:no-var-requires no-submodule-imports
require("bootstrap/dist/css/bootstrap.min.css");

async function updateOrCreateKey(key: string, map: ISharedMap, container: JQuery, runtime: IComponentRuntime) {
    const value = await map.get(key);

    let keyElement = container.find(`>.${key}`);
    const newElement = keyElement.length === 0;

    const isCollab = value ? (value as IComponent).IComponentHandle !== undefined : false;

    if (newElement) {
        // tslint:disable-next-line:no-jquery-raw-elements
        keyElement = $(`<div class="${key} ${isCollab ? "collab-object" : ""}"></div>`);
        container.append(keyElement);
    }

    if (isCollab) {
        if (newElement) {
            const handle = (value as IComponent).IComponentHandle;
            handle.get<SharedMap>().then((sharedMap) => {
                displayMap(keyElement, key, sharedMap, map, runtime);
            });
        }
    } else {
        if (key === "counter") {
            const counter = value as Counter;
            keyElement.text(`${key}: ${counter.value}`);
        } else {
            keyElement.text(`${key}: ${JSON.stringify(value)}`);
        }
    }
}

function displayValues(map: ISharedMap, container: JQuery, runtime: IComponentRuntime) {
    const keys = map.keys();
    const keyArr = [] as string[];
    for (const key of keys) {
        keyArr.push(key);
    }
    keyArr.sort();

    const values = $("<div></div>");
    for (const key of keyArr) {
        updateOrCreateKey(key, map, values, runtime);
    }

    // Listen and process updates
    map.on("valueChanged", async (changed: IValueChanged) => {
        updateOrCreateKey(changed.key, map, values, runtime);
    });

    container.append(values);
}

/**
 * Displays the keys in the map
 */
async function displayMap(
    parentElement: JQuery,
    key: string,
    map: ISharedMap,
    parent: ISharedMap,
    runtime: IComponentRuntime,
) {
    // tslint:disable-next-line:no-jquery-raw-elements
    const header = key !== null ? $(`<h2>${key}: ${map.id}</h2>`) : $(`<h2>${map.id}</h2>`);

    if (key !== null) {
        const hideMap = $("<button style='float:right;margin-right:20px;'></button");
        hideMap.text("x");
        hideMap.click(() => {
            parentElement.addClass("hidden");
        });
        header.append(hideMap);
    }
    parentElement.append(header);

    // tslint:disable-next-line:no-jquery-raw-elements
    const container = $(`<div></div>`);
    // tslint:disable-next-line:no-jquery-raw-elements
    const childMaps = $(`<div></div>`);

    displayValues(map, container, runtime);

    const randomize = $("<button>Randomize</button>");
    randomize.click(() => {
        randomizeMap(map);
    });
    parentElement.append(randomize);

    const addMap = $("<button>Add</button>");
    addMap.click(() => {
        const newMap = SharedMap.create(runtime);
        displayMap(childMaps, null, newMap, map, runtime);
    });
    parentElement.append(addMap);

    if (parent && map.isLocal()) {
        const attach = $("<button>Attach</button>");
        attach.click(() => {
            parent.set(map.id, map.handle);
        });
        parentElement.append(attach);
    }

    parentElement.append(container, childMaps);
}

/**
 * Randomly changes the values in the map
 */
async function randomizeMap(map: ISharedMap) {
    // link up the randomize button
    const keys = ["foo", "bar", "baz", "binky", "winky", "twinkie"];

    const counter: Counter =
        map.createValueType("counter", CounterValueType.Name, undefined).
            get("counter");

    setInterval(async () => {
        // tslint:disable-next-line:insecure-random
        const key = keys[Math.floor(Math.random() * keys.length)];
        // tslint:disable-next-line:insecure-random
        map.set(key, Math.floor(Math.random() * 100000).toString());
        counter.increment(1);
    }, 1000);
}

export class ProgressCollection
    extends EventEmitter
    implements IComponentLoadable, IComponentRouter, IComponentHTMLVisual {

    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new ProgressCollection(runtime, context);
        await collection.initialize();

        return collection;
    }

    public get IComponentLoadable() { return this; }
    public get IComponentRouter() { return this; }
    public get IComponentHTMLVisual() { return this; }

    public url: string;
    private root: ISharedMap;
    private div: HTMLDivElement;

    constructor(private runtime: IComponentRuntime, context: IComponentContext) {
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

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        if (!this.div) {
            this.div = document.createElement("div");
            // Display the initial values and then listen for updates
            displayMap($(this.div), null, this.root, null, this.runtime);
        }

        // reparent if needed
        if (this.div.parentElement !== elm) {
            this.div.remove();
            elm.appendChild(this.div);
        }
    }

    private async initialize() {
        if (!this.runtime.existing) {
            this.root = SharedMap.create(this.runtime, "root");
            this.root.register();
        } else {
            this.root = await this.runtime.getChannel("root") as ISharedMap;
        }
    }
}

class SharedMapVisualizerFactory implements IComponentFactory, IRuntimeFactory {
    public get IComponentFactory() { return this; }
    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const registry = new Map<string, Promise<IComponentFactory>>([
            ["@fluid-example/shared-map-visualizer", Promise.resolve(this)],
        ]);

        const defaultComponentId = "default";
        const defaultComponent = "@fluid-example/shared-map-visualizer";

        const runtime = await ContainerRuntime.load(
            context,
            registry,
            [async (request: IRequest, containerRuntime: IHostRuntime) => {
                console.log(request.url);

                const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
                    ? request.url.substr(1)
                    : request.url;
                const trailingSlash = requestUrl.indexOf("/");

                const componentId = requestUrl
                    ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
                    : defaultComponentId;
                const component = await containerRuntime.getComponentRuntime(componentId, true);

                return component.request({ url: trailingSlash === -1 ? "" : requestUrl.substr(trailingSlash + 1) });
            }],
            { generateSummaries: true });

        // flush mode to manual to batch operations within a turn
        runtime.setFlushMode(FlushMode.Manual);

        // On first boot create the base component
        if (!runtime.existing) {
            await Promise.all([
                    runtime.createComponent(defaultComponentId, defaultComponent).then((componentRuntime) => {
                        componentRuntime.attach();
                    }),
                ])
                .catch((error) => {
                    context.error(error);
                });
        }

        return runtime;
    }

    public instantiateComponent(context: IComponentContext): void {
        const dataTypes = new Map<string, ISharedObjectFactory>();
        const mapFactory = SharedMap.getFactory();
        dataTypes.set(mapFactory.type, mapFactory);

        ComponentRuntime.load(
            context,
            dataTypes,
            undefined,
            (runtime) => {
                const progressCollectionP = ProgressCollection.load(runtime, context);
                runtime.registerRequestHandler(async (request: IRequest) => {
                    const progressCollection = await progressCollectionP;
                    return progressCollection.request(request);
                });
            });
    }
}

export const fluidExport = new SharedMapVisualizerFactory();
