/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import phaser from "phaser";
import { SharedMap } from "@fluidframework/map";
import { TextButton } from "./TextButton";
import { IQuorum } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/component-runtime-definitions";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";

export class GameScene extends phaser.Scene {
    private userId: string = "";
    private gameState: SharedMap | undefined;
    private quorum: IQuorum | undefined;
    private runtime: IFluidDataStoreRuntime | undefined

    private platforms: any;
    private stars: any;
    private players: Map<string, phaser.Physics.Arcade.Sprite> = new Map();
    private scoreTexts: Map<string, any> = new Map();
    private bombs: any;

    constructor() {
        super({
            key: 'GameScene',
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
        if (player !== undefined && clientId !== this.userId) {
            switch (type) {
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

    preload() {
        this.load.image("sky", "assets/sky.png");
        this.load.image("ground", "assets/platform.png");
        this.load.image("star", "assets/star.png");
        this.load.image("bomb", "assets/bomb.png");
        this.load.spritesheet("dude", "assets/dude.png", { frameWidth: 32, frameHeight: 48 });
        this.runtime?.on('signal', this.handleSignal.bind(this));
    }

    private _addPlayer(newId: string) {
        const player = this.physics.add.sprite(100, 450, "dude");

        player.setBounce(0.2);
        player.setCollideWorldBounds(true);

        this.physics.add.collider(player, this.platforms);
        this.physics.add.collider(player, this.bombs, this.hitBomb, undefined, this);
        this.physics.add.overlap(player, this.stars, (player, star) => this.collectStar(player, star, newId), undefined, this);

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
            frames: [{ key: "dude", frame: 4 }],
            frameRate: 20,
        });

        this.anims.create({
            key: "right",
            frames: this.anims.generateFrameNumbers("dude", { start: 5, end: 8 }),
            frameRate: 10,
            repeat: -1,
        });

        const player = this._addPlayer(this.userId);
        this.gameState?.set(this.userId, 0);
        const leftButton = new TextButton(this, 100, 100, 'Left', { fill: '#0f0' }, () => {
            player.setVelocityX(-160);
            player.anims.play("left", true);
            this.runtime?.submitSignal("left", this.userId);
        }, () => {
            player.setVelocityX(0);
            player.anims.play("turn");
            this.runtime?.submitSignal("stop", this.userId);
        });
        this.add.existing(leftButton);

        const rightButton = new TextButton(this, 100, 120, 'Right', { fill: '#0f0' }, () => {
            player.setVelocityX(160);
            player.anims.play("right", true);
            this.runtime?.submitSignal("right", this.userId);
        }, () => {
            player.setVelocityX(0);
            player.anims.play("turn");
            this.runtime?.submitSignal("stop", this.userId);
        });
        this.add.existing(rightButton);

        const upButton = new TextButton(this, 100, 140, 'Up', { fill: '#0f0' }, () => {
            player.setVelocityY(-330);
            this.runtime?.submitSignal("up", this.userId);
        }, () => { });

        this.add.existing(upButton);
        let scoreY = 16;
        setTimeout(() => {
            if (this.quorum !== undefined) {
                for (const otherUserId of this.quorum.getMembers().keys()) {
                    const scoreText = this.add.text(16, scoreY, 'Score: 0', { fontSize: '32px', fill: '#000' });
                    this.scoreTexts.set(otherUserId, scoreText);
                    scoreY += 20;
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

        this.stars.children.iterate(function(child) {
            child.setBounceY(Phaser.Math.FloatBetween(0.1, 0.3));
        });

        this.bombs = this.physics.add.group();
        this.physics.add.collider(this.bombs, this.platforms);

        this.physics.add.collider(this.stars, this.platforms);

        this.physics.add.collider(player, this.bombs, this.hitBomb, undefined, this);
        this.physics.add.overlap(player, this.stars, (player, star) => this.collectStar(player, star, this.userId), undefined, this);
    }

    update() {
        const currentPlayer = this.players.get(this.userId);
        if (currentPlayer === undefined) {
            throw Error("Failed to find player");
        }
    }

    collectStar(player, star, userId) {
        star.disableBody(true, true);
        const currentScore = this.gameState?.get(userId);
        const newScore = currentScore + 10;
        if (userId === this.userId) {
            this.gameState?.set(userId, newScore);
        }
        const scoreText = this.scoreTexts.get(userId);
        scoreText?.setText('Score: ' + newScore);

        this.runtime?.submitSignal("score", newScore);

        if (this.stars.countActive(true) === 0) {
            this.stars.children.iterate(function (child) {
                child.enableBody(true, child.x, 0, true, true);

            });
            var x = (player.x < 400) ? 800 : 300;
            var bomb = this.bombs.create(x, 16, 'bomb');
            bomb.setBounce(1);
            bomb.setCollideWorldBounds(true);
            bomb.setVelocity(100, 80);
            bomb.allowGravity = false;

            bomb = this.bombs.create(-x, 80, 'bomb');
            bomb.setBounce(1);
            bomb.setCollideWorldBounds(true);
            bomb.setVelocity(200, 80);
            bomb.allowGravity = false;
        }
    }

    hitBomb (player, bomb)
    {
        this.physics.pause();

        player.setTint(0xff0000);

        player.anims.play('turn');
    }
}
