/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject } from "@fluidframework/aqueduct";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import { SharedMap } from "@fluidframework/map";
import { IFluidHandle } from "@fluidframework/component-core-interfaces";
import { IFluidGameConfig } from "./interfaces";

export abstract class FluidGame extends DataObject implements IFluidHTMLView {
    constructor(props) {
        super(props);
    }
    public get IFluidHTMLView() { return this; }

    protected _gameState: SharedMap | undefined;

    protected async initializingFirstTime() {
        const gameState = SharedMap.create(this.runtime);
        this.root.set("gameState", gameState.handle);
    }

    protected async hasInitialized() {
        const gameStateHandle = this.root.get<IFluidHandle<SharedMap>>("gameState");
        this._gameState = await gameStateHandle.get();
    }

    /**
     * Will return a new PhaserGame view
     */
    public render(div: HTMLDivElement) {
        if (this._gameState === undefined) {
            throw Error("Failed to initialize state");
        }
        const gameState = this._gameState;
        const quorum = this.runtime.getQuorum();
        const userId = this.runtime.clientId ?? "";
        const parent = document.getElementById("content") as HTMLDivElement;

        const fluidConfig: IFluidGameConfig = {
            userId,
            gameState,
            quorum,
            runtime: this.runtime,
        }
        this.renderGame(parent, fluidConfig)
    }


    public renderGame(div, fluidConfig) {
        throw Error("No game has been rendered");
    }
}

