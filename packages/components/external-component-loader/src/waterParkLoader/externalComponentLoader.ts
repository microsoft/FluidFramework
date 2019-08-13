/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { SharedComponent } from "@prague/aqueduct";
import {
  IComponent,
  IComponentHTMLVisual,
} from "@prague/component-core-interfaces";
import { IPraguePackage } from "@prague/container-definitions";
import * as uuid from "uuid";
import { ExternalComponentView, WaterParkViewName } from "../waterParkView";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../../package.json") as IPraguePackage;
export const WaterParkLoaderName = `${pkg.name}-loader`;

/**
 * Component that loads extneral components via their url
 */
export class ExternalComponentLoader extends SharedComponent implements IComponentHTMLVisual {
    private static readonly defaultComponents = [
        "@chaincode/pinpoint-editor",
        "@chaincode/todo",
        "@chaincode/math",
        "@chaincode/monaco",
        "@chaincode/image-collection",
        "@chaincode/pond",
        "@chaincode/clicker",
    ];
    public get IComponentHTMLVisual() { return this; }

    private viewComponent: ExternalComponentView;
    private readonly viewComponentID = `WaterViewComponentID`;
    private savedElement: HTMLElement;
    private error: string;

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
            input.placeholder = "@chaincode/component-name@version";
            input.style.width = "100%";

            const counterButton = document.createElement("button");
            inputDiv.appendChild(counterButton);
            counterButton.textContent = "Add Component";
            counterButton.onclick = () => this.inputClick(input);

            if (this.error) {
                const errorDiv = document.createElement("div");
                inputDiv.appendChild(errorDiv);
                errorDiv.innerText = this.error;
            }
            const listDiv = document.createElement("div");
            mainDiv.append(listDiv);
            this.viewComponent.render(listDiv);
        }
    }

    protected async componentInitializingFirstTime() {
        await this.createAndAttachComponent(this.viewComponentID, WaterParkViewName);
    }

    protected async componentHasInitialized() {
        this.viewComponent = await this.getComponent(this.viewComponentID);
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
                const componentId = uuid();
                let component = await this.createAndAttachComponent<IComponent>(componentId, url);
                if (component.IComponentCollection !== undefined) {
                    // tslint:disable-next-line: await-promise
                    component = await component.IComponentCollection.createCollectionItem();
                }
                if (component.IComponentLoadable) {
                    this.viewComponent.createCollectionItem(component.IComponentLoadable);
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
