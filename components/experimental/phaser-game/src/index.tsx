/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectFactory } from "@fluidframework/aqueduct";
import phaser from "phaser";
import { Game } from "./Game";
import { IFluidGameConfig } from "./interfaces";
import { FluidGame } from "./FluidGame";

/**
 * Basic PhaserGame example showing how Fluid can be used as net code for Phaser
 */
export class PhaserGame extends FluidGame {
    public renderGame(div: HTMLDivElement, fluidConfig: IFluidGameConfig) {
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
        new Game(div, phaserConfig, fluidConfig);
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
