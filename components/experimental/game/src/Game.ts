/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import phaser from "phaser";
import { GameScene } from "./GameScene";

export class Game extends phaser.Game {
    constructor(parent: HTMLDivElement, gameConfig: Phaser.Types.Core.GameConfig, data: any) {
        super({ ...gameConfig, parent });
        this.scene.add("GameScene", GameScene, true, data);
    }
}
