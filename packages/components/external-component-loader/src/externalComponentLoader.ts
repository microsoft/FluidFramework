/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { PrimedComponent } from "@prague/aqueduct";
import {
  IComponent,
  IComponentHTMLVisual,
  IComponentLoadable,
} from "@prague/container-definitions";
import { MergeTreeDeltaType } from "@prague/merge-tree";
import { IComponentCollection, IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import { SharedObjectSequence, SubSequence } from "@prague/sequence";
import * as uuid from "uuid";
import { pkg } from ".";

/**
 * Component that loads extneral components via their url
 */
export class ExternalComponentLoader extends PrimedComponent implements IComponentHTMLVisual {
    public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<ExternalComponentLoader> {
        const ucl = new ExternalComponentLoader(runtime, context, ExternalComponentLoader.supportedInterfaces);
        await ucl.initialize();

        return ucl;
    }

    private static readonly supportedInterfaces = ["IComponentHTMLVisual", "IComponentHTMLRender", "IComponentRouter"];

    private static readonly defaultComponents = [
        "@chaincode/pinpoint-editor",
        "@chaincode/todo",
        "@chaincode/math",
        "@chaincode/monaco",
        "@chaincode/image-collection",
        "@chaincode/pond",
        "@chaincode/clicker",
    ];

    private readonly urlToComponent = new Map<string, IComponent>();
    private savedElement: HTMLElement;

    public render(element: HTMLElement) {

        if (this.savedElement) {
            while (this.savedElement.firstChild) {
                this.savedElement.removeChild(this.savedElement.firstChild);
            }
        }

        this.savedElement = element;

        if (this.savedElement) {
            const mainDiv = document.createElement("div");
            this.savedElement.appendChild(mainDiv);

            const inputDiv = document.createElement("div");
            mainDiv.appendChild(inputDiv);
            inputDiv.style.border = "1px solid lightgray";
            inputDiv.style.maxWidth = "800px";
            inputDiv.style.margin = "5px";
            inputDiv.style.padding = "5px";
            const dataList = document.createElement("datalist");
            inputDiv.append(dataList);
            dataList.id = uuid();
            ExternalComponentLoader.defaultComponents.forEach((url) => {
                const option = document.createElement("option");
                option.value = `${url}@${pkg.version}`;
                dataList.append(option);
            });

            const input = document.createElement("input");
            inputDiv.append(input);
            input.setAttribute("list", dataList.id);
            input.type = "text";
            input.placeholder = "@chaincode/componentname@version";
            input.style.width = "100%";

            const counterButton = document.createElement("button");
            inputDiv.appendChild(counterButton);
            counterButton.textContent = "Add Component";
            counterButton.onclick = () => this.inputClick(input);

            const sequence = this.root.get<SharedObjectSequence<string>>("componentIds");
            if (sequence !== undefined) {
                sequence.getItems(0).forEach((url) => {
                    const component = this.urlToComponent.get(url);
                    if (component) {
                        const componentVisual =
                            component.query<IComponentHTMLVisual>("IComponentHTMLVisual");
                        if (componentVisual) {
                            const containerDiv = document.createElement("div");
                            mainDiv.appendChild(containerDiv);
                            const style = containerDiv.style;
                            style.border = "1px solid lightgray";
                            style.maxWidth = "800px";
                            style.width = "800px";
                            style.margin = "5px";
                            style.overflow = "hidden";
                            style.position = "relative";

                            const componentDiv = document.createElement("div");
                            containerDiv.appendChild(componentDiv);
                            componentDiv.style.margin = "5px";
                            componentDiv.style.overflow = "hidden";
                            componentDiv.style.zIndex = "0";
                            componentDiv.style.position = "relative";
                            componentVisual.render(componentDiv);
                            if (!this.root.has(`${url}-height`)) {
                                requestAnimationFrame(() => {
                                    if (componentDiv.getBoundingClientRect().height < 100) {
                                        this.root.set(`${url}-height`, 100);
                                    }
                                });
                            } else {
                                componentDiv.style.height = `${this.root.get(`${url}-height`)}px`;
                            }
                            this.renderResize(url, containerDiv);
                        }
                    }
                });
            }
        }
    }

    protected async create() {
        await super.create();
        const sequence = SharedObjectSequence.create<string>(this.runtime);
        sequence.register();
        this.root.set("componentIds", sequence);
    }

    protected async opened() {
        await super.opened();
        const sequence = await this.root.wait<SharedObjectSequence<string>>("componentIds");
        const cacheComponentsByUrl = async (urls: string[]) => {
            const promises =
                // tslint:disable-next-line: promise-function-async
                urls.map((url) => {
                    const urlSplit = url.split("/");
                    if (urlSplit.length > 0) {
                        return this.context.getComponentRuntime(urlSplit.shift(), true)
                            .then(async (componentRuntime) => {
                                return componentRuntime.request({ url: `/${urlSplit.join("/")}` });
                            }).then((request) => {
                                this.urlToComponent.set(url, request.value as IComponent);
                            });
                    }
                    return Promise.resolve();
                });
            while (promises.length > 0) {
                await promises.shift();
            }
        };

        await cacheComponentsByUrl(sequence.getItems(0));

        sequence.on("sequenceDelta", async (event) => {
            if (event.deltaOperation === MergeTreeDeltaType.INSERT) {
                const items = event.deltaArgs.deltaSegments.reduce<string[]>(
                    (pv, cv) => {
                        if (SubSequence.is(cv.segment)) {
                            pv.push(... cv.segment.items);
                        }
                        return pv;
                    },
                    []);
                await cacheComponentsByUrl(items)
                    .then(() => this.render(this.savedElement));
            }
        });
        this.root.on("valueChanged", () => {
            this.render(this.savedElement);
        });

        this.render(this.savedElement);
    }

    private async inputClick(input: HTMLInputElement) {
        const value = input.value;
        if (value !== undefined && value.length > 0) {
            let url = value;
            if (url.startsWith("@chaincode")) {
                url = `https://pragueauspkn-3873244262.azureedge.net/${url}`;
            }
            const seq = await this.root.wait<SharedObjectSequence<string>>("componentIds");

            await this.context.createComponent(uuid(), url)
                .then(async (cr) => {
                    if (cr.attach !== undefined) {
                        cr.attach();
                    }
                    const request = await cr.request({ url: "/" });

                    let component = request.value as IComponentLoadable;
                    const componentCollection = component.query<IComponentCollection>("IComponentCollection");
                    if (componentCollection !== undefined) {
                        component = componentCollection.create() as IComponentLoadable;
                    }
                    seq.insert(seq.getLength(), [component.url]);
                });
        }
    }
    private renderResize(url: string, containerDiv: HTMLDivElement) {
        const resizeDiv = document.createElement("div");
        containerDiv.appendChild(resizeDiv);
        const resizeStyle = resizeDiv.style;
        resizeStyle.backgroundColor = "lightgray";
        resizeDiv.style.width = "100%";
        resizeDiv.style.height = "3px";
        resizeDiv.style.position = "absolute";
        resizeDiv.style.bottom = "0px";
        resizeDiv.style.left = "0px";
        resizeDiv.style.cursor = "ns-resize";
        resizeDiv.onpointerdown = (dev) => {
            dev.preventDefault();
            let prevEv = dev;
            document.onpointermove = (ev) => {
                const heightDiff = ev.clientY - prevEv.clientY;
                if (Math.abs(heightDiff) > 5) {
                    if (!this.root.has(`${url}-height`)) {
                        this.root.set(`${url}-height`, containerDiv.getBoundingClientRect().height);
                    }
                    const newheight = this.root.get<number>(`${url}-height`) + heightDiff;
                    this.root.set(`${url}-height`, newheight);
                    prevEv = ev;
                }
            };
            document.onpointerup = () => {
                document.onpointermove = undefined;
            };
        };
    }
}
