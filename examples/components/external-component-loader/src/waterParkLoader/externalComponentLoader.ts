/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import {
    IComponent,
    IComponentLoadable,
    IResponse,
    IComponentHandle,
} from "@microsoft/fluid-component-core-interfaces";
import { IPackage } from "@microsoft/fluid-container-definitions";
import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
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
    private viewComponentP: Promise<IComponent> | undefined;

    private savedElement: HTMLElement | undefined;
    private error: string | undefined;
    private callbacks: IComponentCallbacks | undefined;

    public get IComponentHTMLView() { return this; }
    public get IComponentCallable() { return this; }

    public setViewComponent(component: IComponent & IComponentLoadable) {
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

        if (this.savedElement !== undefined) {
            // eslint-disable-next-line no-null/no-null
            while (this.savedElement.firstChild !== null) {
                this.savedElement.removeChild(this.savedElement.firstChild);
            }
        }

        this.savedElement = element;

        if (this.savedElement !== undefined) {
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
            editableButton.onclick = () => {
                if (this.callbacks?.toggleEditable !== undefined) {
                    this.callbacks.toggleEditable();
                }
            };

            if (this.error !== undefined) {
                const errorDiv = document.createElement("div");
                inputDiv.appendChild(errorDiv);
                errorDiv.innerText = this.error;
            }
        }
    }

    protected async componentHasInitialized() {
        const viewComponentHandle = this.root.get<IComponentHandle>(this.viewComponentMapID);
        if (viewComponentHandle !== undefined) {
            this.viewComponentP = viewComponentHandle.get();
        }
    }

    private async inputClick(input: HTMLInputElement) {
        const value = input.value;
        input.value = "";
        this.error = undefined;
        if (value === undefined || value.length === 0) {
            input.style.backgroundColor = "#FEE";
            return;
        }

        try {
            if (this.viewComponentP === undefined) {
                throw new Error("View component promise not set!!");
            }

            const viewComponent = await this.viewComponentP;
            if (viewComponent.IComponentCollection === undefined || this.runtime.IComponentRegistry === undefined) {
                throw new Error("View component is empty or is not an IComponentCollection!!");
            }

            const urlReg = await this.runtime.IComponentRegistry.get("url");
            if (urlReg?.IComponentRegistry === undefined) {
                throw new Error("Couldn't get url component registry");
            }

            const pkgReg = await urlReg.IComponentRegistry.get(value) as IComponent;
            let componentRuntime: IComponentRuntime;
            const id = uuid();
            if (pkgReg?.IComponentDefaultFactoryName !== undefined) {
                componentRuntime = await this.context.hostRuntime.createComponent(
                    id,
                    [
                        ...this.context.packagePath,
                        "url",
                        value,
                        pkgReg.IComponentDefaultFactoryName.getDefaultFactoryName(),
                    ]);
            } else if (pkgReg?.IComponentFactory !== undefined) {
                componentRuntime = await this.context.hostRuntime.createComponent(
                    id,
                    [
                        ...this.context.packagePath,
                        "url",
                        value,
                    ]);
            } else {
                throw new Error(`${value} is not a factory, and does not provide default component name`);
            }

            const response: IResponse = await componentRuntime.request({ url: "/" });
            let component: IComponent = response.value as IComponent;
            componentRuntime.attach();
            if (component.IComponentCollection !== undefined) {
                component = component.IComponentCollection.createCollectionItem();
            }
            viewComponent.IComponentCollection.createCollectionItem({
                handle: component.IComponentHandle,
                type: value,
                id,
            });
        } catch (error) {
            this.error = error;
            if (this.savedElement !== undefined) {
                this.render(this.savedElement);
            }
        }
    }
}
