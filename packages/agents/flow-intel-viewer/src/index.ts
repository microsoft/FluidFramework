/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHTMLVisual } from "@prague/container-definitions";
import { ISharedMap } from "@prague/map";

export class FlowIntelViewer implements IComponentHTMLVisual {
  private static readonly supportedInterfaces = ["IComponentHTMLVisual", "IComponentHTMLRender", "IComponentRouter"];

  constructor(private readonly insights: ISharedMap) {
  }

  public query(id: string): any {
    return FlowIntelViewer.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
  }

  public list(): string[] {
      return FlowIntelViewer.supportedInterfaces;
  }

  public render(div: HTMLElement) {
    this.renderCore(div);
    this.insights.on("valueChanged", (changed) => {
      if (changed.key === "TextAnalytics") {
        this.renderCore(div);
      }
    });
    return div;
  }

  private renderCore(div: HTMLElement) {
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
