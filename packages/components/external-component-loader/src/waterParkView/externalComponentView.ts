/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { PrimedComponent } from "@prague/aqueduct";
import {
  IComponent,
  IComponentHTMLRender,
  IComponentHTMLVisual,
  IComponentQueryableLegacy,
} from "@prague/component-core-interfaces";
import { IPraguePackage } from "@prague/container-definitions";
import { MergeTreeDeltaType } from "@prague/merge-tree";
import { IComponentCollection } from "@prague/runtime-definitions";
import { SharedObjectSequence, SubSequence } from "@prague/sequence";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../../package.json") as IPraguePackage;
export const WaterParkViewName = `${pkg.name}-view`;

/**
 * Component that loads extneral components via their url
 */
export class ExternalComponentView extends PrimedComponent implements IComponentHTMLVisual, IComponentCollection {

    public get IComponentHTMLVisual() { return this; }
    public get IComponentHTMLRender() { return this; }
    public get IComponentCollection() { return this; }

    private sequence: SharedObjectSequence<string>;
    private readonly urlToComponent = new Map<string, IComponent>();
    private savedElement: HTMLElement;

    public createCollectionItem<T>(options: T): IComponent  {
        // tslint:disable-next-line: no-string-literal
        const url = options["url"];
        if (!url) {
            throw new Error("Options do not contain any url!!");
        }
        this.sequence.insert(this.sequence.getLength(), [url]);
        return options as IComponent;
    }

    public removeCollectionItem(instance: IComponent): void {
        let componentUrl: string;
        if (instance.IComponentLoadable) {
            componentUrl = instance.IComponentLoadable.url;
        }
        const componentRemoved: boolean = this.sequence.delete(componentUrl);
        if (componentRemoved) {
            this.urlToComponent.delete(componentUrl);
        }
        throw new Error("Deletion of item from sequence was unsuccessful!!");
    }

    public render(element: HTMLElement) {

        if (element === undefined) {
            return;
        }

        if (this.savedElement) {
            while (this.savedElement.firstChild) {
                this.savedElement.removeChild(this.savedElement.firstChild);
            }
        }

        this.savedElement = element;

        if (this.savedElement) {
            const mainDiv = document.createElement("div");
            this.savedElement.appendChild(mainDiv);

            if (this.sequence !== undefined) {
                this.sequence.getItems(0).forEach((url) => {
                    const component = this.urlToComponent.get(url);
                    if (component) {
                        const queryable = component as IComponentQueryableLegacy;
                        let renderable = component.IComponentHTMLRender;
                        if (!renderable && queryable.query) {
                            renderable = queryable.query<IComponentHTMLRender>("IComponentHTMLRender");
                        }
                        if (renderable) {
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
                            renderable.render(
                                componentDiv,
                                {
                                    display: "block",
                                });
                            if (!this.root.has(`${url}-height`)) {
                                requestAnimationFrame(() => {
                                    if (componentDiv.getBoundingClientRect().height < 100) {
                                        this.root.set(`${url}-height`, 100);
                                    }
                                });
                            } else {
                                componentDiv.style.height = `${this.root.get(`${url}-height`)}px`;
                            }
                            this.renderSubComponentButton(url, containerDiv);
                            this.renderResize(url, containerDiv);
                        }
                    }
                });
            }
        }
    }

    protected async componentInitializingFirstTime() {
        const sequence = SharedObjectSequence.create<string>(this.runtime);
        sequence.register();
        this.root.set("componentIds", sequence);
    }

    protected async componentHasInitialized() {
        this.sequence = await this.root.wait<SharedObjectSequence<string>>("componentIds");
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

        await cacheComponentsByUrl(this.sequence.getItems(0));

        this.sequence.on("sequenceDelta", async (event) => {
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
                    .then(() => this.render(this.savedElement))
                    .catch((e) => {
                        this.render(this.savedElement);
                    });

            }
        });
        this.root.on("valueChanged", () => {
            this.render(this.savedElement);
        });

        this.render(this.savedElement);
    }

    private renderSubComponentButton(url: string, containerDiv: HTMLDivElement) {
        const subComponentButtonDiv = document.createElement("button");
        containerDiv.appendChild(subComponentButtonDiv);
        subComponentButtonDiv.innerText = "↗";
        subComponentButtonDiv.onclick = () => {
            window.open(`${window.location.origin}${window.location.pathname}/${url}${window.location.search}`,
                "_blank");
        };
        const subComponentButtonStyle = subComponentButtonDiv.style;
        subComponentButtonStyle.height = "25px";
        subComponentButtonStyle.width = "35px";
        subComponentButtonStyle.textAlign = "center";
        subComponentButtonStyle.border = "none";
        subComponentButtonStyle.position = "absolute";
        subComponentButtonStyle.top = "0px";
        subComponentButtonStyle.right = "0px";
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
