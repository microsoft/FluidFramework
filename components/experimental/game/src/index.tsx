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
import {TextButton} from "./button";
import { IQuorum } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/component-runtime-definitions";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";

class DemoScene extends phaser.Scene {
    private platforms: any;
    private stars: any;
    private players: Map<string, phaser.Physics.Arcade.Sprite> = new Map();
    private userId: string = "";
    private gameState: SharedMap | undefined;
    private quorum: IQuorum | undefined;
    private runtime: IFluidDataStoreRuntime | undefined

    constructor()
    {
        super({
            key: 'DemoScene',
          });
    }

    public init = (data) => {
        const { userId, gameState, quorum, runtime } = data;
        this.userId = userId;
        this.gameState = gameState;
        this.gameState?.set("started", true);
        this.quorum = quorum;
        this.runtime = runtime;
    };

    private handleSignal(signal: IInboundSignalMessage) {
        const { clientId, type } = signal;
        const player = this.players.get(clientId);
        if (player !== undefined) {
            switch(type) {
                case "left":
                    player.setVelocityX(-160);
                    player.anims.play("left", true);
                    break;
                case "right":
                    player.setVelocityX(160);
                    player.anims.play("right", true);
                    break;
                case "up":
                    player.setVelocityY(-330);
                    break;
                case "stop":
                    player.setVelocityX(0);
                    player.anims.play("turn");
                    break;
                default:
                    break;
            }
        }
    }

    preload()
    {
        this.load.image("sky", "assets/sky.png");
        this.load.image("ground", "assets/platform.png");
        this.load.image("star", "assets/star.png");
        this.load.image("bomb", "assets/bomb.png");
        this.load.spritesheet("dude", "assets/dude.png", { frameWidth: 32, frameHeight: 48 });
        this.runtime?.on('signal', this.handleSignal.bind(this));
    }

    private _addPlayer(newId: string){
        const player = this.physics.add.sprite(100, 450, "dude");

        player.setBounce(0.2);
        player.setCollideWorldBounds(true);

        this.physics.add.collider(player, this.platforms);
        this.physics.add.overlap(player, this.stars, this.collectStar, undefined, this);

        this.players.set(newId, player);
        return player;
    }

    create() {
        this.add.image(400, 300, "sky");

        this.platforms = this.physics.add.staticGroup();

        this.platforms.create(400, 568, "ground").setScale(2).refreshBody();

        this.platforms.create(600, 400, "ground");
        this.platforms.create(50, 250, "ground");
        this.platforms.create(750, 220, "ground");

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

        const player = this._addPlayer(this.userId);
        const leftButton = new TextButton(this, 100, 100, 'Left', { fill: '#0f0'},() => {
            player.setVelocityX(-160);
            player.anims.play("left", true);
            this.runtime?.submitSignal("left", this.userId);
        }, () => {
            player.setVelocityX(0);
            player.anims.play("turn");
            this.runtime?.submitSignal("stop", this.userId);
        });
        this.add.existing(leftButton);

        const rightButton = new TextButton(this, 100, 120, 'Right', { fill: '#0f0'}, () => {
            player.setVelocityX(160);
            player.anims.play("right", true);
            this.runtime?.submitSignal("right", this.userId);
        }, () => {
            player.setVelocityX(0);
            player.anims.play("turn");
            this.runtime?.submitSignal("stop", this.userId);
        });
        this.add.existing(rightButton);

        const upButton = new TextButton(this, 100, 140, 'Up', { fill: '#0f0'}, () => {
            player.setVelocityY(-330);
            this.runtime?.submitSignal("up", this.userId);
        }, () => {});

        this.add.existing(upButton);

        setTimeout(() => {
            if (this.quorum !== undefined) {
                for (const otherUserId of  this.quorum.getMembers().keys()) {
                    if (this.players.get(otherUserId) === undefined) {
                        this._addPlayer(otherUserId);
                    }
                }
            }
        }, 500);

        this.stars = this.physics.add.group({
            key: 'star',
            repeat: 11,
            setXY: { x: 12, y: 0, stepX: 70 }
        });

        this.stars.children.iterate(function (child) {
            child.setBounceY(Phaser.Math.FloatBetween(0.1, 0.3));
        });

        this.physics.add.collider(this.stars, this.platforms);

        this.physics.add.overlap(player, this.stars, this.collectStar, undefined, this);
    }

    update() {
        const currentPlayer = this.players.get(this.userId);
        if (currentPlayer === undefined) {
            throw Error("Failed to find player");
        }
    }

    collectStar(player, star)
    {
        star.disableBody(true, true);
        this.runtime?.submitSignal("score", { x: star.x, y: star.y });
    }
}

export class Demo extends Phaser.Game
{
    constructor(parent: HTMLDivElement, gameConfig: Phaser.Types.Core.GameConfig, data: any)
    {
        super({ ...gameConfig, parent });
        this.scene.add("DemoScene", DemoScene, true, data);
    }
}
/**
 * Basic ClickerFunction example showing Clicker as a React Function component
 */
export class ClickerFunction extends DataObject implements IFluidHTMLView {
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
     * Will return a new ClickerFunction view
     */
    public render(div: HTMLDivElement) {
        if (this._gameState === undefined) {
            throw Error("Failed to initialize state");
        }
        const gameState = this._gameState;
        const quorum = this.runtime.getQuorum();
        const userId = this.runtime.clientId ?? "";
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

        new Demo(parent, config, {userId, gameState, quorum, runtime: this.runtime});
        return div;
    }
}

// ----- FACTORY SETUP -----
export const ClickerFunctionInstantiationFactory = new DataObjectFactory(
    "clicker-function",
    ClickerFunction,
    [],
    {},
);
export const fluidExport = ClickerFunctionInstantiationFactory;
