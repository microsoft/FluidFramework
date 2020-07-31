/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObjectFactory, DataObject,
} from "@fluidframework/aqueduct";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import phaser from "phaser";
import { SharedMap } from "@fluidframework/map";
import { IFluidHandle } from "@fluidframework/component-core-interfaces";
import { Game } from "./Game";
import { IFluidGameConfig } from "./interfaces";

/**
 * Basic PhaserGame example showing how Fluid can be used as net code for Phaser
 */
export class PhaserGame extends DataObject implements IFluidHTMLView {
    constructor(props) {
        super(props);
    }
    public get IFluidHTMLView() { return this; }

    private _gameState: SharedMap | undefined;

    /**
     * Do setup work here
     */
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
        const phaserConfig = {
            type: phaser.AUTO,
            width: 800,
            height: 600,
            physics: {
                default: "arcade",
                arcade: {
                    gravity: { y: 300 },
                    debug: false,
                },
            },
        };

        const fluidConfig: IFluidGameConfig = {
            userId,
            gameState,
            quorum,
            runtime: this.runtime,
        }

        new Game(parent, phaserConfig, fluidConfig);
        return div;
    }
}

// ----- FACTORY SETUP -----
export const PhaserGameInstantiationFactory = new DataObjectFactory(
    "PhaserGame",
    PhaserGame,
    [],
    {},
);
export const fluidExport = PhaserGameInstantiationFactory;
