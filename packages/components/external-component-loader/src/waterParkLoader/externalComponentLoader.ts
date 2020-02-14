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
} from "@microsoft/fluid-component-core-interfaces";
import { IPackage } from "@microsoft/fluid-container-definitions";
import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import * as uuid from "uuid";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require("../../package.json") as IPackage;
export const WaterParkLoaderName = `${pkg.name}-loader`;

/**
 * Component that loads extneral components via their url
 */
export class ExternalComponentLoader extends PrimedComponent
    implements IComponentHTMLView {

    private static readonly defaultComponents = [
        "@fluid-example/todo",
        "@fluid-example/math",
        "@fluid-example/monaco",
        "@fluid-example/image-collection",
        "@fluid-example/pond",
        "@fluid-example/clicker",
    ];
    private readonly viewComponentMapID: string = "ViewComponentUrl";
    private viewComponentP: Promise<IComponent>;

    private savedElement: HTMLElement;
    private error: string;

    public get IComponentHTMLView() { return this; }

    public setViewComponent(component: IComponentLoadable) {
        this.root.set(this.viewComponentMapID, component.IComponentLoadable.url);
        this.viewComponentP = Promise.resolve(component);
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
            ExternalComponentLoader.defaultComponents.forEach((url) => {
                const option = document.createElement("option");
                option.value = `${url}@${pkg.version}`;
                dataList.append(option);
            });

            const input = document.createElement("input");
            inputDiv.append(input);
            input.setAttribute("list", dataList.id);
            input.type = "text";
            input.placeholder = "@fluid-example/component-name@version";
            input.style.width = "100%";

            const counterButton = document.createElement("button");
            inputDiv.appendChild(counterButton);
            counterButton.textContent = "Add Component";
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            counterButton.onclick = () => this.inputClick(input);

            if (this.error) {
                const errorDiv = document.createElement("div");
                inputDiv.appendChild(errorDiv);
                errorDiv.innerText = this.error;
            }
        }
    }

    protected async componentHasInitialized() {
        const viewComponentUrl: string = this.root.get(this.viewComponentMapID);
        if (viewComponentUrl) {
            this.viewComponentP = this.getComponent(viewComponentUrl);
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
                        if (pkgReg.IComponentDefaultFactoryName) {
                            componentRuntime = await this.context.hostRuntime.createComponent(
                                uuid(),
                                [
                                    WaterParkLoaderName,
                                    "url",
                                    url,
                                    pkgReg.IComponentDefaultFactoryName.getDefaultFactoryName(),
                                ]);
                        } else if (pkgReg.IComponentFactory) {
                            componentRuntime = await this.context.hostRuntime.createComponent(
                                uuid(),
                                [
                                    WaterParkLoaderName,
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
                            // eslint-disable-next-line @typescript-eslint/await-thenable
                            component = await component.IComponentCollection.createCollectionItem();
                        }
                        viewComponent.IComponentCollection.createCollectionItem(component.IComponentLoadable);
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
