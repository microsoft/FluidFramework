/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

import React from "react";
import ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const pkg = require("../package.json");
const pkgversion = pkg.version as string;
const versionTest2Name = pkg.name as string;

export class VersionTest extends DataObject implements IFluidHTMLView {
    public get IFluidHTMLView() { return this; }
    private upgradeToPkg: string = "@fluid-internal/version-test-3";
    private upgradeToVersion: string = "0.3.x";

    protected async hasInitialized() {
        if (this.root.get("diceValue") === undefined) {
            this.root.set("diceValue", 0);
        }
        this.root.set("title2", "version 2");
    }

    public render(div: HTMLElement) {
        const rerender = () => {
            const title = this.root.get("title");
            const title2 = this.root.get("title2");
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const diceValue = this.root.get<number>("diceValue")!;

            ReactDOM.render(
                <div>
                    old title:
          <p className="title">{title}</p>
                    <input className="titleInput" type={"text"}
                        onChange={(e) => this.root.set("title", e.target.value)} />
                    <br />
                    new title:
          <p className="title2">{title2}</p>
                    <input className="title2Input" type={"text"}
                        onChange={(e) => this.root.set("title2", e.target.value)} />
                    <br />
                    <p><span style={{ backgroundColor: "springgreen" }}>version {pkgversion}</span></p>
                    <br />
                    <div>
                        <input type="text" value={this.upgradeToPkg}
                            onChange={(e) => { this.upgradeToPkg = e.currentTarget.value; rerender(); }} />@
                        <input type="text" value={this.upgradeToVersion}
                            onChange={(e) => { this.upgradeToVersion = e.currentTarget.value; rerender(); }} />
                    </div>
                    <button onClick={() => this.quorumProposeCode()}>Upgrade Version</button>
                    <div>
                        cool dice roller:
          <span className="diceValue" style={{ fontSize: 50 }}>{this.getDiceChar(diceValue)}</span>
                        <button className="diceRoller" onClick={this.rollDice.bind(this)}>Roll</button>
                    </div>
                </div>,
                div,
            );
        };

        rerender();
        this.root.on("valueChanged", rerender);
        return div;
    }
    private rollDice() {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const dice: number = this.root.get("diceValue")!;
        this.root.set("diceValue", dice + 1);
    }

    private getDiceChar(value: number) {
        // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
        return String.fromCodePoint(0x2680 + value);
    }

    private quorumProposeCode() {
        setTimeout(() => {
            // If this promise rejects, the test should fail but currently it may not.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.runtime.getQuorum().propose(
                "code",
                {
                    config: {
                        cdn: `https://pragueauspkn.azureedge.net/@yo-fluid/${this.upgradeToPkg}`,
                    },
                    package: `${this.upgradeToPkg}@${this.upgradeToVersion}`,
                },
            );
        }, 3000);
    }
}

export const VersiontestInstantiationFactory = new DataObjectFactory(versionTest2Name, VersionTest, [], {});
