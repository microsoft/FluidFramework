/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap } from "@fluidframework/map";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";

export class FlowIntelViewer implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private insightFound = false;
    constructor(private readonly insights: ISharedMap) {
    }

    public remove(): void {
    }

    public render(div: HTMLElement) {
        if (this.insights.get("TextAnalytics")) {
            this.renderCore(div);
        }
        this.insights.on("valueChanged", (changed) => {
            if (changed.key === "TextAnalytics") {
                this.renderCore(div);
            }
        });
        return div;
    }

    private renderCore(div: HTMLElement) {
        if (!this.insightFound) {
            (div as HTMLDivElement).style.display = "initial";
            this.insightFound = true;
        }
        const textInsights = this.insights.get("TextAnalytics");
        // tslint:disable no-inner-html
        div.innerHTML = this.createHTML(textInsights);
    }

    private createHTML(textInsights: any): string {
        const html = `
        <ul>
            <li>
                Language: ${textInsights.language}
            </li>
            <li>
                Sentiment: ${textInsights.sentiment.toFixed(2)}
            </li>
            ${this.listLocations(textInsights.entities)}
        </ul>`;
        return html;
    }

    private listLocations(entities: any[]): string {
        if (entities === undefined || entities.length === 0) {
            return "";
        }
        const locationSet = new Set<string>();
        for (const entity of entities) {
            if (entity.type === "Location") {
                locationSet.add(entity.name as string);
            }
        }
        if (locationSet.size === 0) {
            return "";
        }
        // const locationList = `<li>Locations:<ul>`;
        let locationList = "";
        for (const location of locationSet) {
            locationList += `<li>${location}</li>`;
        }
        return `<li>Locations:<ul>${locationList}</ul></li>`;
    }
}
