/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { SyncedComponent } from "@fluidframework/react";
import phaser from "phaser";

export class DemoScene extends phaser.Scene {
    private platforms: any;
    private player: any;
    private cursors: any;
    constructor()
    {
        super("demo");
    }

    preload()
    {
        this.load.image("sky", "assets/sky.png");
        this.load.image("ground", "assets/platform.png");
        this.load.image("star", "assets/star.png");
        this.load.image("bomb", "assets/bomb.png");
        this.load.spritesheet("dude",
            "assets/dude.png",
            { frameWidth: 32, frameHeight: 48 },
        );
    }

    create()
    {
        this.add.image(400, 300, "sky");

        this.platforms = this.physics.add.staticGroup();

        this.platforms.create(400, 568, "ground").setScale(2).refreshBody();

        this.platforms.create(600, 400, "ground");
        this.platforms.create(50, 250, "ground");
        this.platforms.create(750, 220, "ground");

        this.player = this.physics.add.sprite(100, 450, "dude");

        this.player.setBounce(0.2);
        this.player.setCollideWorldBounds(true);

        this.anims.create({
            key: "left",
            frames: this.anims.generateFrameNumbers("dude", { start: 0, end: 3 }),
            frameRate: 10,
            repeat: -1,
        });

        this.anims.create({
            key: "turn",
            frames: [ { key: "dude", frame: 4 } ],
            frameRate: 20,
        });

        this.anims.create({
            key: "right",
            frames: this.anims.generateFrameNumbers("dude", { start: 5, end: 8 }),
            frameRate: 10,
            repeat: -1,
        });

        this.cursors = this.input.keyboard.createCursorKeys();

        this.physics.add.collider(this.player, this.platforms);
    }

    update() {
        if (this.cursors.left?.isDown === true)
        {
            this.player.setVelocityX(-160);

            this.player.anims.play("left", true);
        }
        else if (this.cursors.right?.isDown === true)
        {
            this.player.setVelocityX(160);

            this.player.anims.play("right", true);
        }
        else
        {
            this.player.setVelocityX(0);

            this.player.anims.play("turn");
        }

        if (this.cursors.up?.isDown === true && this.player.body.touching.down === true)
        {
            this.player.setVelocityY(-330);
        }
    }
}

export class Demo extends Phaser.Game
{
    constructor(parent: HTMLDivElement, gameConfig: Phaser.Types.Core.GameConfig)
    {
        super({ ...gameConfig, parent });
        this.scene.add("DemoScene", DemoScene, true);
    }
}

export class ClickerFunction extends SyncedComponent {
    constructor(props) {
        super(props);
    }

    /**
     * Will return a new ClickerFunction view
     */
    public render(div: HTMLElement) {
        const parent = document.getElementById("content") as HTMLDivElement;
        const config = {
            type: Phaser.AUTO,
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

        new Demo(parent, config);
        return div;
    }
}

// ----- FACTORY SETUP -----
export const ClickerFunctionInstantiationFactory = new PrimedComponentFactory(
    "clicker-function",
    ClickerFunction,
    [],
    {},
);
export const fluidExport = ClickerFunctionInstantiationFactory;
