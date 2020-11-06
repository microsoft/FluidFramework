/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import { UpgradeManager } from "@fluidframework/base-host";

import React from "react";
import ReactDOM from "react-dom";
import { IsoBuffer } from "@fluidframework/common-utils";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
const pkgversion = pkg.version as string;
const signalKey = {
    upgradeHighPriority: "upgrade high priority",
    upgradeLowPriority: "upgrade low priority",
};
const versionTest1Name = pkg.name as string;

export class VersionTest extends DataObject implements IFluidHTMLView {
    public get IFluidHTMLView() { return this; }
    private upgradeManager: UpgradeManager | undefined;
    private upgradeToPkg: string = "@fluid-internal/version-test-2";
    private upgradeToVersion: string = "0.2.x";
    private cdn: string = "http://localhost:8080/file";

    protected async initializingFirstTime() {
        this.root.set("title", "version 1");
    }

    protected async hasInitialized() {
        this.upgradeManager = new UpgradeManager(this.runtime);

        this.runtime.on("signal", (message) => {
            if (message.type === signalKey.upgradeHighPriority) {
                // If this promise rejects, the test should fail but currently it may not.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.upgradeManagerProposeCode(true);
            } else if (message.type === signalKey.upgradeLowPriority) {
                // If this promise rejects, the test should fail but currently it may not.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.upgradeManagerProposeCode(false);
            }
        });
    }

    public async render(div: HTMLElement) {
        const rerender = async () => {
            div.ondrop = async (event) => {
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                if (!event || !event.dataTransfer) {
                    return;
                }
                event.dataTransfer.dropEffect = "copy";
                event.preventDefault();

                const dt = event.dataTransfer;
                const files = dt.files;
                const arrayBufferReader = new FileReader();
                const buffer = await new Promise<Buffer>((resolve, reject) => {
                    arrayBufferReader.onerror = (error) => {
                        arrayBufferReader.abort();
                        reject(new Error(`error: ${JSON.stringify(error)}`));
                    };

                    arrayBufferReader.onloadend = () => {
                        const blobData = Buffer.from(arrayBufferReader.result as ArrayBuffer);
                        resolve(blobData);
                    };
                    arrayBufferReader.readAsArrayBuffer(files[0]);
                });

                const blob = await this.runtime.uploadBlob(buffer);
                this.root.set("blob", blob);
            };

            div.ondragover = (event) => {
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                if (!event || !event.dataTransfer) {
                    return;
                }
                event.dataTransfer.dropEffect = "copy";
                event.preventDefault();
            };

            const title = this.root.get("title");
            const blobHandle = this.root.get("blob");
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            const imgSrc = blobHandle
                ? `data:image/png;base64,${IsoBuffer.from(await blobHandle.get()).toString("base64")}`
                : "https://media.giphy.com/media/13V60VgE2ED7oc/giphy.gif";

            ReactDOM.render(
                <div>
                    <img src={imgSrc}></img>
                    <br/>
                    old title:
          <p className="title">{title}</p>
                    <input className="titleInput" type={"text"}
                        onChange={(e) => this.root.set("title", e.target.value)} />
                    <br />
                    <p><span style={{ backgroundColor: "salmon" }}>version {pkgversion}</span></p>
                    <br />
                    <div>
                        package:
            <input type="text" value={this.upgradeToPkg}
                            // eslint-disable-next-line @typescript-eslint/no-floating-promises
                            onChange={(e) => { this.upgradeToPkg = e.currentTarget.value; rerender(); }} />@
            <input type="text" value={this.upgradeToVersion}
                            // eslint-disable-next-line @typescript-eslint/no-floating-promises
                            onChange={(e) => { this.upgradeToVersion = e.currentTarget.value; rerender(); }} />
                        <br />
                        cdn:
            <input className="cdn" type="text" value={this.cdn}
                            // eslint-disable-next-line @typescript-eslint/no-floating-promises
                            onChange={(e) => { this.cdn = e.currentTarget.value; rerender(); }} />
                    </div>
                    <button className="upgrade" onClick={() => this.quorumProposeCode()}>Upgrade Version</button>
                    <br />
                    <button onClick={() => this.sendUpgradeSignal(true)}>
                        Upgrade Version Via UpgradeManager (high priority)</button>
                    <br />
                    <button onClick={() => this.sendUpgradeSignal(false)}>
                        Upgrade Version Via UpgradeManager (low priority)</button>
                </div>,
                div,
            );
        };

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        rerender();
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.root.on("valueChanged", rerender);

        return div;
    }

    private sendUpgradeSignal(highPriority: boolean) {
        this.runtime.submitSignal(
            highPriority
                ? signalKey.upgradeHighPriority
                : signalKey.upgradeLowPriority,
            undefined,
        );
    }

    private async upgradeManagerProposeCode(highPriority: boolean) {
        if (this.upgradeManager === undefined) {
            throw Error("fluid object not initialized; no upgrade manager");
        }
        await this.upgradeManager.upgrade({
            config: { cdn: `${this.cdn}/@fluid-internal/version-test-2` },
            package: `${this.upgradeToPkg}`,
        }, highPriority);
    }

    private quorumProposeCode() {
        // If this promise rejects, the test should fail but currently it may not.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.runtime.getQuorum().propose(
            "code",
            { config: { cdn: `${this.cdn}/@fluid-internal/version-test-2` }, package: `${this.upgradeToPkg}` },
        );
    }
}

export const VersiontestInstantiationFactory = new DataObjectFactory(versionTest1Name, VersionTest, [], {});
