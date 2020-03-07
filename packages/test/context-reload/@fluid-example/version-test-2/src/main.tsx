/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  PrimedComponent,
  PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
  IComponentHTMLView,
} from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
const pkgversion = pkg.version as string;

export class VersionTest extends PrimedComponent implements IComponentHTMLView {
  public get IComponentHTMLView() { return this; }
  private upgradeToPkg: string = "@fluid-example/version-test-3";
  private upgradeToVersion: string = "0.3.x";

  protected async componentHasInitialized() {
    if (!this.root.get("diceValue")) {
      this.root.set("diceValue", 0);
    }
    this.root.set("title2", "version 2");
  }

  public render(div: HTMLElement) {
    const rerender = () => {
      const title = this.root.get("title");
      const title2 = this.root.get("title2");
      const diceValue = this.root.get<number>("diceValue");

      ReactDOM.render(
        <div>
          <p>old title:{title}</p>
          <p>new title:{title2}</p>
          <input type={"text"} onChange={e => this.root.set("title", e.target.value)} />
          <br />
          <p><span style={{backgroundColor: "springgreen"}}>version {pkgversion}</span></p>
          <br />
          <div>
            <input type="text" value={this.upgradeToPkg} onChange={e => {this.upgradeToPkg = e.currentTarget.value; rerender();}} />@
            <input type="text" value={this.upgradeToVersion} onChange={e => {this.upgradeToVersion = e.currentTarget.value; rerender();}} />
          </div>
          <button onClick={() => this.quorumProposeCode()}>Upgrade Version</button>
          <div>
          cool dice roller:
          <span className="dicevalue" style={{ fontSize: 50 }}>{this.getDiceChar(diceValue)}</span>
          <button className="diceroller" onClick={this.rollDice.bind(this)}>Roll</button>
          </div>
        </div>,
        div
      );
    };

    rerender();
    this.root.on("valueChanged", rerender);
    return div;
  }
  private rollDice() {
    this.root.set("diceValue", this.root.get("diceValue") + 1);
  }

  private getDiceChar(value: number) {
    // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
    return String.fromCodePoint(0x2680 + value);
  }

  private quorumProposeCode() {
    setTimeout(() => this.runtime.getQuorum().propose(
      "code",
      { "config": { "@yo-fluid:cdn": "https://pragueauspkn-3873244262.azureedge.net" }, "package": `${ this.upgradeToPkg }@${ this.upgradeToVersion }` },
    ), 3000);
  }
}

export const VersiontestInstantiationFactory = new PrimedComponentFactory(VersionTest, []);
