/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import {
    IComponent,
    IComponentHTMLView,
    IComponentLoadable,
    IResponse,
    IComponentHandle,
} from "@microsoft/fluid-component-core-interfaces";
import { IPackage } from "@microsoft/fluid-container-definitions";
import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import * as uuid from "uuid";
import { IComponentCallable, IComponentCallbacks } from "@fluid-example/spaces";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require("../../package.json") as IPackage;
export const WaterParkLoaderName = `${pkg.name}-loader`;

/**
 * Component that loads extneral components via their url
 */
export class ExternalComponentLoader extends PrimedComponent
    implements IComponentHTMLView, IComponentCallable<IComponentCallbacks> {

    private static readonly defaultComponents = [
        "@fluid-example/todo",
        "@fluid-example/math",
        "@fluid-example/monaco",
        "@fluid-example/image-collection",
        "@fluid-example/pond",
        "@fluid-example/clicker",
        "@fluid-example/primitives",
        "@fluid-example/table-view",
    ];
    private readonly viewComponentMapID: string = "ViewComponentUrl";
    private viewComponentP: Promise<IComponent>;

    private savedElement: HTMLElement;
    private error: string;
    private callbacks: IComponentCallbacks;

    public get IComponentHTMLView() { return this; }
    public get IComponentCallable() { return this; }

    public setViewComponent(component: IComponentLoadable & PrimedComponent) {
        this.root.set(this.viewComponentMapID, component.IComponentHandle);
        this.viewComponentP = Promise.resolve(component);
    }

    public setComponentCallbacks(callbacks: IComponentCallbacks) {
        this.callbacks = callbacks;
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

            const inputDiv = document.createElement("div");
            mainDiv.appendChild(inputDiv);
            const dataList = document.createElement("datalist");
            inputDiv.append(dataList);
            dataList.id = uuid();

            // When locally developing, want to load the latest available patch version by default
            const defaultVersionToLoad = pkg.version.endsWith(".0") ? `^${pkg.version}` : pkg.version;
            ExternalComponentLoader.defaultComponents.forEach((url) => {
                const option = document.createElement("option");
                option.value = `${url}@${defaultVersionToLoad}`;
                dataList.append(option);
            });

            const input = document.createElement("input");
            inputDiv.append(input);
            input.setAttribute("list", dataList.id);
            input.type = "text";
            input.placeholder = "@fluid-example/component-name@version";
            input.style.width = "100%";
            inputDiv.onkeyup = (event: KeyboardEvent) => {
                if (event.keyCode === 13) {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    this.inputClick(input);
                }
            };

            const counterButton = document.createElement("button");
            inputDiv.appendChild(counterButton);
            counterButton.textContent = "Add Component";
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            counterButton.onclick = () => this.inputClick(input);

            const editableButton = document.createElement("button");
            inputDiv.append(editableButton);
            editableButton.textContent = "Toggle Edit";
            editableButton.onclick = () => this.callbacks.toggleEditable();

            if (this.error) {
                const errorDiv = document.createElement("div");
                inputDiv.appendChild(errorDiv);
                errorDiv.innerText = this.error;
            }
        }
    }

    protected async componentHasInitialized() {
        const viewComponentHandle = this.root.get<IComponentHandle>(this.viewComponentMapID);
        if (viewComponentHandle) {
            this.viewComponentP = viewComponentHandle.get();
        }
    }

    private async inputClick(input: HTMLInputElement) {
        const value = input.value;
        input.value = "";
        this.error = undefined;
        if (value !== undefined && value.length > 0) {
            let url = value;
            if (url.startsWith("@")) {
                url = `https://pragueauspkn-3873244262.azureedge.net/${url}`;
            }

            try {
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                if (this.viewComponentP) {
                    const viewComponent = await this.viewComponentP;
                    if (viewComponent && viewComponent.IComponentCollection && this.runtime.IComponentRegistry) {
                        const urlReg = await this.runtime.IComponentRegistry.get("url");
                        const pkgReg = await urlReg.IComponentRegistry.get(url) as IComponent;
                        let componentRuntime: IComponentRuntime;
                        const id = uuid();
                        if (pkgReg.IComponentDefaultFactoryName) {
                            componentRuntime = await this.context.hostRuntime.createComponent(
                                id,
                                [
                                    ...this.context.packagePath,
                                    "url",
                                    url,
                                    pkgReg.IComponentDefaultFactoryName.getDefaultFactoryName(),
                                ]);
                        } else if (pkgReg.IComponentFactory) {
                            componentRuntime = await this.context.hostRuntime.createComponent(
                                id,
                                [
                                    ...this.context.packagePath,
                                    "url",
                                    url,
                                ]);
                        } else {
                            throw new Error(`${url} is not a factory, and does not provide default component name`);
                        }

                        const response: IResponse = await componentRuntime.request({ url: "/" });
                        let component: IComponent = response.value as IComponent;
                        componentRuntime.attach();
                        if (component.IComponentCollection !== undefined) {
                            component = component.IComponentCollection.createCollectionItem();
                        }
                        // The type value here looks sketchy
                        viewComponent.IComponentCollection.createCollectionItem({
                            handle: component.IComponentHandle,
                            type: value,
                            id,
                        });
                    } else {
                        throw new Error("View component is empty or is not an IComponentCollection!!");
                    }
                } else {
                    throw new Error("View component promise not set!!");
                }
            } catch (error) {
                this.error = error;
                this.render(this.savedElement);
            }
        } else {
            input.style.backgroundColor = "#FEE";
        }
    }
}
