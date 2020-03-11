/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { resolve } from "url";
import {
    IComponentHTMLOptions,
    IComponentHTMLView,
    IComponentLoadable,
    IComponentRouter,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime } from "@microsoft/fluid-component-runtime";
import {
    IContainerContext,
    IFluidCodeDetails,
    IRuntime,
    IRuntimeFactory,
} from "@microsoft/fluid-container-definitions";
import { ContainerRuntime } from "@microsoft/fluid-container-runtime";
import { IDocumentFactory } from "@microsoft/fluid-host-service-interfaces";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRuntime,
    IHostRuntime,
} from "@microsoft/fluid-runtime-definitions";
import * as scribe from "@microsoft/fluid-server-tools-core";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import Axios from "axios";

// eslint-disable-next-line max-len
// eslint-disable-next-line @typescript-eslint/no-require-imports, import/no-internal-modules, import/no-unassigned-import
require("bootstrap/dist/css/bootstrap.min.css");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkgVersion = require("../package.json").version;
const version = `${pkgVersion.endsWith(".0") ? "^" : ""}${pkgVersion}`;

// Text represents the loaded file text
let text: string;
let intervalTime: number;
let authorCount: number;
let initialRun: boolean = true;

async function downloadRawText(textUrl: string): Promise<string> {
    const result = await Axios.get<string>(resolve(document.baseURI, textUrl));
    if (result.status !== 200) {
        return Promise.reject(result.data);
    }

    return result.data;
}

function updateProgressBar(progressBar: HTMLElement, progress: number) {
    if (progress !== undefined) {
        progressBar.style.width = `${(100 * progress).toFixed(2)}%`;
        if (progress === 1) {
            progressBar.classList.remove("active");
        }
    }
}

function resetProgressBar(progressBar: HTMLElement) {
    progressBar.style.width = "0%";
    progressBar.classList.add("active");
}

function updateMetrics(
    div: HTMLDivElement,
    metrics: scribe.IScribeMetrics,
    ackProgressBar: HTMLElement,
    typingProgressBar: HTMLElement,
) {
    if (authorCount === 1) {
        updateProgressBar(ackProgressBar, metrics.ackProgress);
        updateProgressBar(typingProgressBar, metrics.typingProgress);
    }

    if (metrics.ackRate) {
        (div.getElementsByClassName("ack-rate")[0] as HTMLDivElement).innerText =
            `Ack rate: ${(metrics.ackRate).toFixed(2)} characters/second`;
    }

    if (metrics.latencyAverage) {
        (div.getElementsByClassName("avg-latency")[0] as HTMLDivElement).innerText =
            `Average latency: ${(metrics.latencyAverage).toFixed(2)} ms`;
    }

    if (metrics.latencyStdDev) {
        (div.getElementsByClassName("stddev-latency")[0] as HTMLDivElement).innerText =
            `Standard deviation: ${(metrics.latencyStdDev).toFixed(2)} ms`;
    }

    if (metrics.typingRate) {
        (div.getElementsByClassName("typing-rate")[0] as HTMLDivElement).innerText =
            `Typing rate: ${(metrics.typingRate).toFixed(2)} characters/second`;
    }

    if (metrics.serverAverage) {
        (div.getElementsByClassName("server-latency")[0] as HTMLDivElement).innerText =
            `Server latency (local orderer only): ${(metrics.serverAverage).toFixed(2)} ms`;
    }

    if (metrics.pingAverage) {
        (div.getElementsByClassName("avg-ping")[0] as HTMLDivElement).innerText =
            `Ping: ${(metrics.pingAverage).toFixed(2)} ms`;
    }

    if (metrics.totalOps) {
        (div.getElementsByClassName("total-ops")[0] as HTMLDivElement).innerText =
            `Total Ops: ${(metrics.totalOps).toFixed(2)}`;
    }

    if (metrics.processAverage) {
        (div.getElementsByClassName("avg-process")[0] as HTMLDivElement).innerText =
            `Process time: ${(metrics.processAverage).toFixed(2)}`;
    }
}

function handleFiles(
    createButton: HTMLButtonElement,
    startButton: HTMLButtonElement,
    createDetails: HTMLElement,
    files: FileList) {
    if (files.length !== 1) {
        createButton.classList.add("hidden");
        startButton.classList.add("hidden");
        createDetails.classList.add("hidden");
        return;
    }

    // Prep the file reader to process the selected file
    const reader = new FileReader();
    reader.onload = (event) => {
        // After loading the file show the create button
        text = reader.result as string;
    };

    // Read the selected file
    const file = files.item(0);
    reader.readAsText(file);
}

function addLink(element: HTMLDivElement, link: string) {
    const anchor = document.createElement("a");
    anchor.href = link;
    anchor.innerText = anchor.href;
    anchor.target = "_blank";
    element.appendChild(anchor);
    element.appendChild(document.createElement("br"));
}

function initialize(
    div: HTMLDivElement,
    context: IComponentContext,
    runtime: IComponentRuntime,
    root: ISharedMap,
    template: string,
    speed: number,
    authors: number,
    languages: string,
) {
    const loadFile = !template;

    // Easy access to a couple of page elements
    const textForm = div.getElementsByClassName("text-form")[0] as HTMLFormElement;
    const startForm = div.getElementsByClassName("start-form")[0] as HTMLFormElement;
    const createButton = div.getElementsByClassName("create")[0] as HTMLButtonElement;
    const createWarning = div.getElementsByClassName("create-warning")[0] as HTMLButtonElement;
    const startButton = div.getElementsByClassName("start")[0] as HTMLButtonElement;
    const createDetails = div.getElementsByClassName("create-details")[0] as HTMLElement;
    const typingDetails = div.getElementsByClassName("typing-details")[0] as HTMLElement;
    const intervalElement = div.getElementsByClassName("interval")[0] as HTMLInputElement;
    const translationElement = div.getElementsByClassName("translation")[0] as HTMLInputElement;
    const authorElement = div.getElementsByClassName("authors")[0] as HTMLInputElement;
    const typingProgress = div.getElementsByClassName("typing-progress")[0] as HTMLElement;
    const typingProgressBar = typingProgress.getElementsByClassName("progress-bar")[0] as HTMLElement;
    const ackProgress = div.getElementsByClassName("ack-progress")[0] as HTMLElement;
    const ackProgressBar = ackProgress.getElementsByClassName("progress-bar")[0] as HTMLElement;

    // Set the speed and translation elements
    intervalElement.value = speed.toString();
    authorElement.value = authors.toString();
    if (translationElement) {
        translationElement.value = languages;
    }

    if (loadFile) {
        const inputElement = div.getElementsByClassName("file")[0] as HTMLInputElement;
        inputElement.addEventListener(
            "change",
            () => {
                handleFiles(createButton, startButton, createDetails, inputElement.files);
            },
            false);
    } else {
        downloadRawText(template).then((rawText) => {
            text = rawText;
        }, (error) => {
            console.log(`Error downloading document ${error}`);
        });
    }

    const documentFactory: IDocumentFactory = context.scope ? context.scope.IDocumentFactory : undefined;
    if (documentFactory) {
        createButton.classList.remove("hidden");
    } else {
        createWarning.classList.remove("hidden");
    }

    let url: string;

    textForm.addEventListener("submit", (event) => {
        intervalTime = Number.parseInt(intervalElement.value, 10);
        authorCount = Number.parseInt(authorElement.value, 10);

        const details: IFluidCodeDetails = {
            config: {
                "@fluid-example:cdn": "https://pragueauspkn-3873244262.azureedge.net",
            },
            package: `@fluid-example/shared-text@${version}`,
        };
        const createP = documentFactory.create(details);
        createP.then(
            (createUrl) => {
                url = createUrl;

                const linkList = div.getElementsByClassName("link-list")[0] as HTMLDivElement;

                addLink(linkList, url);

                if (languages) {
                    linkList.appendChild(document.createElement("br"));
                    const translationDiv = document.createElement("div");
                    translationDiv.innerText = "Translations";
                    linkList.appendChild(translationDiv);
                    for (const language of languages.split(",")) {
                        addLink(linkList, `/${url}?language=${language}`);
                    }
                }

                startButton.classList.remove("hidden");
                createDetails.classList.remove("hidden");
                createButton.classList.add("hidden");
            }, (err) => {
                console.log(err);
            });

        event.preventDefault();
        event.stopPropagation();
    });

    startForm.addEventListener("submit", (event) => {
        scribe.togglePlay();

        if (initialRun) {
            // Initialize the scribe progress UI.
            if (authorCount === 1) {
                resetProgressBar(ackProgressBar);
                resetProgressBar(typingProgressBar);
            } else {
                ackProgress.classList.add("hidden");
                typingProgress.classList.add("hidden");
            }
            typingDetails.classList.remove("hidden");

            // Start typing and register to update the UI
            const typeP = scribe.type(
                context.loader,
                url,
                root,
                runtime,
                intervalTime,
                text,
                authorCount,
                1,
                (metrics) => updateMetrics(div, metrics, ackProgressBar, typingProgressBar));

            // Output the total time once typing is finished
            typeP.then(
                (time) => {
                    (div.getElementsByClassName("total-time")[0] as HTMLDivElement).innerText =
                        `Total time: ${(time.time / 1000).toFixed(2)} seconds`;
                    console.log("Done typing file");
                },
                (error) => {
                    console.error(error);
                });
            initialRun = false;
        }

        const buttonText = startButton.innerText;
        // eslint-disable-next-line no-unused-expressions
        buttonText === "Start" ? startButton.innerText = "Pause" : startButton.innerText = "Start";

        event.preventDefault();
        event.stopPropagation();
    });
}

const html =
    `
<div class="container">
    <h1>Scribe</h1>

    <form class="text-form">
        <div class="form-group">
            <label for="interval">Typing Interval (ms)</label>
            <input type="text" class="form-control interval">
        </div>
        <div class="form-group">
            <label for="authors">Number of Authors</label>
            <input type="text" class="form-control authors">
        </div>
        <div class="form-group">
            <label for="distributed">Distributed</label>
            <input type="checkbox" class="form-control distributed">
        </div>
        <button class="btn btn-default hidden create" style="margin-bottom: 10px;">Create</button>
        <p class="hidden create-warning">Host does not support creating new documents</p>
    </form>

    <form class="start-form">
        <button class="btn btn-default hidden start" style="margin-bottom: 10px;">Start</button>
    </form>

    <div class="create-details hidden">
        <p class="link-list">
        </p>
    </div>

    <div class="typing-details hidden">
        <img src="https://praguenpm.blob.core.windows.net/images/corgi-typing.gif" />

        <!-- Progress of the scribe writing the document -->
        <h3>
            Typing progress
        </h3>
        <div class="typing-progress progress">
            <div class="progress-bar progress-bar-striped active" role="progressbar" style="width: 0%">
            </div>
        </div>
        <p class="typing-rate">
        </p>

        <!-- Progress of the server ACKing the writing commands -->
        <div class="hidden">
        <h3>
            Server acknowledgement progress
        </h3>
        <div class="ack-progress progress">
            <div class="progress-bar progress-bar-striped active" role="progressbar" style="width: 0%">
            </div>
        </div>
        </div>
        <p class="ack-rate">
        </p>
        <p>
            <span class="avg-latency"></span><br/>
            <span class="stddev-latency"></span><br/>
            <span class="server-latency"></span><br/>
            <span class="avg-process"></span><br/>
            <span class="avg-ping"></span><br/>
            <span class="total-ops"></span>
        </p>

        <div class="total-time"></div>
    </div>
</div>
`;

export class Scribe
    extends EventEmitter
    implements IComponentLoadable, IComponentRouter, IComponentHTMLView {

    public static async load(runtime: IComponentRuntime, context: IComponentContext) {
        const collection = new Scribe(runtime, context);
        await collection.initialize();

        return collection;
    }

    public get IComponentLoadable() { return this; }
    public get IComponentRouter() { return this; }
    public get IComponentHTMLView() { return this; }

    public url: string;
    private root: ISharedMap;
    private div: HTMLDivElement;

    constructor(private readonly runtime: IComponentRuntime, private readonly context: IComponentContext) {
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
            // tslint:disable-next-line:no-inner-html
            this.div.innerHTML = html;
            initialize(
                this.div,
                this.context,
                this.runtime,
                this.root,
                "https://www.wu2.prague.office-int.com/public/literature/resume.txt",
                50,
                1,
                "");
        }

        // Reparent if needed
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

class ScribeFactory implements IComponentFactory, IRuntimeFactory {
    public static readonly type = "@fluid-example/scribe";
    public readonly type = ScribeFactory.type;

    public get IComponentFactory() { return this; }
    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const registry = new Map<string, Promise<IComponentFactory>>([
            [ScribeFactory.type, Promise.resolve(this)],
        ]);

        const defaultComponentId = "default";

        const runtime = await ContainerRuntime.load(
            context,
            registry,
            [async (request: IRequest, containerRuntime: IHostRuntime) => {
                console.log(request.url);

                const requestUrl = request.url.length > 0 && request.url.startsWith("/")
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

        // On first boot create the base component
        if (!runtime.existing) {
            await Promise.all([
                runtime.createComponent(defaultComponentId, ScribeFactory.type).then((componentRuntime) => {
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

        const runtime = ComponentRuntime.load(
            context,
            dataTypes,
        );

        const progressCollectionP = Scribe.load(runtime, context);
        runtime.registerRequestHandler(async (request: IRequest) => {
            const progressCollection = await progressCollectionP;
            return progressCollection.request(request);
        });
    }
}

export const fluidExport = new ScribeFactory();
