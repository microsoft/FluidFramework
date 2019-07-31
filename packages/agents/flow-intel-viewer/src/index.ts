/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentHTMLView, IComponentHTMLVisual } from "@prague/component-core-interfaces";
import { ISharedMap } from "@prague/map";

export class FlowIntelViewer implements IComponentHTMLVisual {
  public get IComponentHTMLVisual() { return this; }
  public get IComponentHTMLRender() { return this; }

  private insightFound = false;
  constructor(private readonly insights: ISharedMap) {
  }

  public addView(scope?: IComponent): IComponentHTMLView {
    return new FlowIntelViewer(this.insights);
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
    const html = `
    <ul>
      <li>
        Language: ${textInsights.language}
      </li>
      <li>
        Sentiment: ${textInsights.sentiment.toFixed(2)}
      </li>
    </ul>`;
    // tslint:disable no-inner-html
    div.innerHTML = html;
  }
}
