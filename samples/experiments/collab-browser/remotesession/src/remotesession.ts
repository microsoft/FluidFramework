/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { urlToInclusion } from "../../../../routerlicious/packages/client-ui/src/blob";
import { IMap, IMapView, MapExtension } from "../../../../routerlicious/packages/map";
import { IChaincode, IPlatform, IRuntime } from "../../../../routerlicious/packages/runtime-definitions";
import { Component, Store } from "../../../../routerlicious/packages/store";
import { UI } from "./ui";

const insightsMapId = "insights";
const createdDateKey = "__debug_created";
const imageKey = "imageSha";
const widthKey = "width";
const heightKey = "height";

interface IRemoteSessionState { root: IMapView; runtime: IRuntime; }

export class RemoteSession extends Component {
    private readonly stateR: (state: IRemoteSessionState) => void;
    private readonly stateP: Promise<IRemoteSessionState>;

    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);

        // 'any' to work around TS2454: TypeScript 3.0.1 does not believe 'capturedResolver' is initialized before use.
        let capturedResolver: any;
        this.stateP = new Promise<IRemoteSessionState>((resolver) => { capturedResolver = resolver; });
        this.stateR = capturedResolver;
    }

    public async setImage(image: string, width: number, height: number) {
        const state = await this.stateP;
        state.root.set(widthKey, width);
        state.root.set(heightKey, height);
        const blobData = await urlToInclusion(image);
        await state.runtime.uploadBlob(blobData);
        state.root.set(imageKey, blobData.sha);

        const imageSize = Math.ceil(blobData.content.byteLength / 1024);
        console.log(`*** setImage(width: ${width}, height: ${height}, image: ${blobData.sha} (${imageSize} kB))`);
    }

    public async getImage(): Promise<{ height: number, image: string, width: number }> {
        const state = await this.stateP;
        const height = state.root.get(heightKey);
        const width = state.root.get(widthKey);
        const sha = state.root.get(imageKey);
        console.log(`*** getImage(width: ${width}, height: ${height}, image: ${sha})`);

        let image = "";
        if (sha) {
            try {
                image = (await state.runtime.getBlob(sha)).url;
            } catch (error) { console.error(`Unable get blob: ${error}`); }
        }

        return { height, image, width };
    }

    public async opened(runtime: IRuntime, platform: IPlatform, root: IMapView) {
        console.log("component loaded");

        this.stateR({ root, runtime });

        root.getMap().on("valueChanged", (change) => {
            // When an image is updated, imageKey is the last key to be set.
            if (change.key === imageKey) {
                this.emit("valueChanged", { change });
            }
        });

        const maybeDiv = await platform.queryInterface("div") as HTMLDivElement;
        if (maybeDiv) {
            // Wait for connection before mounting the UI.
            if (!runtime.connected) {
                await new Promise<void>((resolve) => runtime.once("connected", resolve));
            }

            const ui = new UI(this);
            maybeDiv.appendChild(await ui.mount(platform));
        }
    }

    protected async create(runtime: IRuntime, platform: IPlatform, root: IMap) {
        const insights = runtime.createChannel(insightsMapId, MapExtension.Type);
        root.set(insightsMapId, insights);
        root.set(createdDateKey, new Date());
        root.set(widthKey, 0);
        root.set(heightKey, 0);
        root.set(imageKey, "");
    }
}

// Example chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
    return Store.instantiate(new RemoteSession());
}
