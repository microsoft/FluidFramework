/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  PrimedComponent,
  PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import { UpgradeManager } from "@fluidframework/base-host"

import * as React from "react";
import * as ReactDOM from "react-dom";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
const pkgversion = pkg.version as string;
const signalKey = {
  upgradeHighPriority: "upgrade high priority",
  upgradeLowPriority: "upgrade low priority",
}
const versionTest1Name = pkg.name as string;

export class VersionTest extends PrimedComponent implements IComponentHTMLView {
  public get IComponentHTMLView() { return this; }
  private upgradeManager: UpgradeManager | undefined;
  private upgradeToPkg: string = "@fluid-example/version-test-2";
  private upgradeToVersion: string = "0.2.x";
  private cdn: string = "http://localhost:8080/file";

  protected async componentInitializingFirstTime() {
    this.root.set("title", "version 1");
  }

  protected async componentHasInitialized() {
    this.upgradeManager = new UpgradeManager(this.runtime);

    this.runtime.on("signal", (message) => {
      if (message.type === signalKey.upgradeHighPriority) {
        this.upgradeManagerProposeCode(true);
      } else if (message.type === signalKey.upgradeLowPriority) {
        this.upgradeManagerProposeCode(false);
      }
    });
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
          <br/>
          <button onClick={() => this.sendUpgradeSignal(true)}>Upgrade Version Via UpgradeManager (high priority)</button>
          <br/>
          <button onClick={() => this.sendUpgradeSignal(false)}>Upgrade Version Via UpgradeManager (low priority)</button>
        </div>,
        div
      );
    };

    rerender();
    this.root.on("valueChanged", rerender);

    return div;
  }

  private sendUpgradeSignal(highPriority: boolean) {
    this.runtime.submitSignal(highPriority ? signalKey.upgradeHighPriority : signalKey.upgradeLowPriority, undefined);
  }

  private async upgradeManagerProposeCode(highPriority: boolean) {
    if (!this.upgradeManager) {
      throw Error("component not initialized; no upgrade manager")
    }
    await this.upgradeManager.upgrade({
      "config": { "cdn": `${this.cdn}/@fluid-example/version-test-2` },
      "package": `${ this.upgradeToPkg }`
    }, highPriority);
  }

  private quorumProposeCode() {
    this.runtime.getQuorum().propose(
      "code",
      { "config": { "cdn": `${this.cdn}/@fluid-example/version-test-2` }, "package": `${ this.upgradeToPkg }` },
    );
  }
}

export const VersiontestInstantiationFactory = new PrimedComponentFactory(versionTest1Name, VersionTest, [], {});
