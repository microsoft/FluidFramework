/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  PrimedComponent,
  PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
const pkgversion = pkg.version as string;
const versionTest1Name = pkg.name as string;

export class VersionTest extends PrimedComponent implements IComponentHTMLView {
  public get IComponentHTMLView() { return this; }
  private upgradeToPkg: string = "@fluid-example/version-test-2";
  private upgradeToVersion: string = "0.2.x";
  private cdn: string = "http://localhost:8080/file";

  protected async componentInitializingFirstTime() {
    this.root.set("title", "version 1");
  }

  public render(div: HTMLElement) {
    const rerender = () => {
      const title = this.root.get("title");

      ReactDOM.render(
        <div>
          old title:
          <p className="title">{title}</p>
          <input className="titleInput" type={"text"} onChange={e => this.root.set("title", e.target.value)} />
          <br />
          <p><span style={{backgroundColor: "salmon"}}>version {pkgversion}</span></p>
          <br />
          <div>
            package:
            <input type="text" value={this.upgradeToPkg} onChange={e => {this.upgradeToPkg = e.currentTarget.value; rerender();}} />@
            <input type="text" value={this.upgradeToVersion} onChange={e => {this.upgradeToVersion = e.currentTarget.value; rerender();}} />
            <br/>
            cdn:
            <input className="cdn" type="text" value={this.cdn} onChange={e => {this.cdn = e.currentTarget.value; rerender();}} />
          </div>
          <button className="upgrade" onClick={() => this.quorumProposeCode()}>Upgrade Version</button>
        </div>,
        div
      );
    };

    rerender();
    this.root.on("valueChanged", rerender);

    return div;
  }

  private quorumProposeCode() {
    console.log(`code: ${this.upgradeToPkg} on ${this.cdn}`);
    this.runtime.getQuorum().propose(
      "code",
      { "config": { "cdn": `${this.cdn}/@fluid-example/version-test-2` }, "package": `${ this.upgradeToPkg }` },
    );
  }
}

export const VersiontestInstantiationFactory = new PrimedComponentFactory(versionTest1Name, VersionTest, []);
