/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import {
    IComponent,
    IComponentHandle,
    IComponentHTMLView,
    IComponentLoadable,
} from "@microsoft/fluid-component-core-interfaces";
import { IDirectory } from "@microsoft/fluid-map";
import { IPackage } from "@microsoft/fluid-container-definitions";
import { IComponentCollection } from "@microsoft/fluid-framework-interfaces";
import { HTMLViewAdapter } from "@microsoft/fluid-view-adapters";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require("../../package.json") as IPackage;
export const WaterParkViewName = `${pkg.name}-view`;

/**
 * Component that loads extneral components via their url
 */
export class ExternalComponentView extends PrimedComponent implements
    IComponentHTMLView,
    IComponentCollection {

    public get IComponentHTMLView() { return this; }
    public get IComponentCollection() { return this; }

    private readonly handleToComponent = new Map<IComponentHandle, IComponent>();
    private savedElement: HTMLElement;
    private componentSubDirectory: IDirectory;

    public createCollectionItem<T>(options: T): IComponent {
        // eslint-disable-next-line dot-notation
        const handle: IComponentHandle = options["handle"];
        const url: string = options["url"];
        if (!handle) {
            throw new Error("Options do not contain any handle!!");
        }

        let loadableComponent: IComponentLoadable;
        handle.get()
            .then((component) => {
                if (component.IComponentLoadable) {
                    this.handleToComponent.set(handle, component);
                    this.componentSubDirectory.set(component.url, handle);
                    loadableComponent = { url, IComponentLoadable: component.IComponentLoadable };
                } else {
                    throw new Error("Component is not an instance of IComponentLoadable!!");
                }
            })
            .catch((error) => {
                throw error;
            });
        return loadableComponent;
    }

    public removeCollectionItem(instance: IComponent): void {
        if (instance.IComponentLoadable) {
            const url = instance.IComponentLoadable.url;
            const handle = this.componentSubDirectory.get("url");
            this.handleToComponent.delete(handle);
            this.componentSubDirectory.delete(url);
        } else {
            throw new Error("Component url is not found in component");
        }
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

            if (this.componentSubDirectory !== undefined) {
                this.componentSubDirectory.forEach((handle) => {
                    const component = this.handleToComponent.get(handle);
                    const componentUrl = component.IComponentLoadable.url;
                    if (component && HTMLViewAdapter.canAdapt(component)) {
                        const renderable = new HTMLViewAdapter(component);

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
                        if (!this.root.has(`${handle}-height`)) {
                            requestAnimationFrame(() => {
                                if (componentDiv.getBoundingClientRect().height < 100) {
                                    this.root.set(`${handle}-height`, 100);
                                }
                            });
                        } else {
                            componentDiv.style.height = `${this.root.get(`${handle}-height`)}px`;
                        }
                        this.renderSubComponentButton(componentUrl, containerDiv);
                        this.renderResize(componentUrl, containerDiv);
                    }
                });
            }
        }
    }

    protected async componentInitializingFirstTime() {
        this.root.createSubDirectory("component-list");
    }

    protected async componentHasInitialized() {
        this.componentSubDirectory = this.root.getSubDirectory("component-list");
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
