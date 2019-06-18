/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { controls, ui } from "@prague/client-ui";
import { IMap } from "@prague/map";
import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { Chaincode } from "./chaincode";
import { Document } from "./document";

const template =
`<div id="player-div">
    <form id="text-form">
        <div class="form-group">
            <label for="video">Youtube Video Id</label>
            <input type="text" class="form-control" id="videoId">
        </div>
        <button type="button" class="btn btn-default" id="switch" style="margin-bottom: 10px;">Switch</button>
    </form>
</div>`;

class YoutubePlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string): Promise<T> {
        return null;
    }
}

class Runner {
    public async run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform> {
        this.start(runtime, platform).catch((error) => console.error(error));
        return new YoutubePlatform();
    }

    private async start(runtime: IRuntime, platform: IPlatform): Promise<void> {
        const collabDoc = await Document.load(runtime);

        const hostContent: HTMLDivElement = await platform.queryInterface<HTMLDivElement>("div");
        if (!hostContent) {
            // If headless exist early
            return;
        }

        hostContent.innerHTML = template;

        const host = new ui.BrowserContainerHost();

        const root = collabDoc.getRoot();

        // Create our distributed Map, called "youTubeVideo", on the root map
        if (!collabDoc.existing) {
            await root.set<IMap>("youTubeVideo", collabDoc.createMap());
        }

        const videoMap = await root.wait<IMap>("youTubeVideo");

        const canvas = new controls.YouTubeVideoCanvas(hostContent.children[0] as HTMLDivElement, videoMap);
        host.attach(canvas);
    }
}

export async function instantiate(): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const chaincode = new Chaincode(new Runner());
    return chaincode;
}
