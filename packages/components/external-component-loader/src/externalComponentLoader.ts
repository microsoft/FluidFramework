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
                this.savedElement.firstChild.remove();
            }
        }

        this.savedElement = element;

        if (this.savedElement) {
            const mainDiv = document.createElement("div");
            mainDiv.style.display = "inline:block";
            const inputDiv = document.createElement("div");
            inputDiv.style.border = "1px solid lightgray";
            inputDiv.style.maxWidth = "800px";
            inputDiv.style.margin = "5px";
            inputDiv.style.padding = "5px";
            const dataList = document.createElement("datalist");
            dataList.id = uuid();
            ExternalComponentLoader.defaultComponents.forEach((url) => {
                const option = document.createElement("option");
                option.value = url;
                dataList.append(option);
            });

            inputDiv.append(dataList);

            const input = document.createElement("input");
            input.setAttribute("list", dataList.id);
            input.type = "text";
            input.placeholder = "@chaincode/componentname";
            input.style.width = "100%";
            inputDiv.append(input);

            const counterButton = document.createElement("button");
            counterButton.textContent = "Add Component";
            counterButton.onclick = () => this.click(input.value);
            inputDiv.appendChild(counterButton);
            mainDiv.appendChild(inputDiv);

            const sequence = this.root.get<SharedObjectSequence<string>>("componentIds");
            if (sequence !== undefined) {
                sequence.getItems(0).forEach((url) => {
                    const component = this.urlToComponent.get(url);
                    if (component) {
                        const componentVisual =
                            component.query<IComponentHTMLVisual>("IComponentHTMLVisual");
                        if (componentVisual) {
                            const componentDiv = document.createElement("div");
                            const style = componentDiv.style;
                            style.border = "1px solid lightgray";
                            style.maxWidth = "800px";
                            style.margin = "5px";
                            style.padding = "5px";
                            style.overflow = "hidden";

                            const height = this.root.get(`${url}-height`);
                            if (height) {
                                style.height = height;
                            }
                            const width = this.root.get(`${url}-width`);
                            if (width) {
                                style.width = width;
                            }

                            componentVisual.render(componentDiv);
                            mainDiv.appendChild(componentDiv);
                            if (!height) {
                                // hack to make sure components render at a reasonable height,
                                // looking at you monaco
                                requestAnimationFrame(() => {
                                    if (componentDiv.getBoundingClientRect().height < 100) {
                                        this.root.set(`${url}-height`, "100px");
                                    }
                                });
                            }
                        }
                    }
                });
            }

            this.savedElement.appendChild(mainDiv);
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

    private async click(value: string) {
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
}
