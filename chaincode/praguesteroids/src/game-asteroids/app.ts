import { IMapView } from "@prague/map";
import { IPlatform } from "@prague/runtime-definitions";
import * as Stage from "stage-js/platform/web";
import { Document } from "../document";
import { highScoreConst, Physics } from "./physics";

/*
 * Copyright (c) 2016-2018 Ali Shakiba http://shakiba.me/planck.js
 *
 * This software is provided 'as-is', without any express or implied
 * warranty.    In no event will the authors be held liable for any damages
 * arising from the use of this software.
 * Permission is granted to anyone to use this software for any purpose,
 * including commercial applications, and to alter it and redistribute it
 * freely, subject to the following restrictions:
 * 1. The origin of this software must not be misrepresented; you must not
 * claim that you wrote the original software. If you use this software
 * in a product, an acknowledgment in the product documentation would be
 * appreciated but is not required.
 * 2. Altered source versions must be plainly marked as such, and must not be
 * misrepresented as being the original software.
 * 3. This notice may not be removed or altered from any source distribution.
*/
/*
    This source is heavily modified from the original to integrate multi player support.
*/

function getHearts(count: number) {
    let h = "";
    for (let i = 0; i < count; i++) {
        h += " ♥";
    }

    return h;
}

export class PragueSteroids {
    public static async Start(collabDoc: Document, platform: IPlatform) {
        if (!collabDoc.runtime.connected) {
            await new Promise<void>((resolve) => collabDoc.runtime.on("connected", () => resolve()));
        }

        const view = await collabDoc.getRoot().getView();

        Stage({
            textures: {
                text: (d) => {
                    d += "";
                    return Stage.canvas((ctx) => {
                        const ratio = 2;
                        ctx.size(16, 24, ratio);
                        ctx.scale(ratio, ratio);
                        ctx.font = "bold 24px monospace";
                        ctx.fillStyle = "#ddd";
                        ctx.textBaseline = "top";
                        ctx.fillText(d, 0, 1);
                    });
                },
            },
        });

        return new PragueSteroids(collabDoc, view);
    }

    constructor(document: Document, private pragueView: IMapView) {
        const hs = pragueView.get(highScoreConst);
        if (hs == null) {
            pragueView.set(highScoreConst, JSON.stringify({ user: "", friendlyName: "", score: 0 }));
        }

        document.runtime.on("clientLeave", (name) => {
            // ignored
        });

        this.doStage();
    }

    private doStage() {
        Stage((stage) => this.runStage(stage));
    }

    private runStage(stage) {
        const activeKeys = {};
        const KEY_NAMES = {
            32: "fire",
            37: "right",
            38: "up",
            39: "left",
            40: "down",
            65: "a",
        };

        const physics = new Physics(
            this.pragueView,
            {
                activeKeys,
                endGame,
                startGame,
                updateStatus,
            });

        let world;
        let meta;
        let gameover;

        stage.background("#222222");
        stage.on("viewport", (size) => {
            meta.pin({
                scaleHeight: size.height,
                scaleMode: "in-pad",
                scaleWidth: size.width,
            });
            world.pin({
                scaleHeight: size.height,
                scaleMode: "in-pad",
                scaleWidth: size.width,
            });
        });

        world = new Stage
            .planck(physics.world, { ratio: 80 })
            .pin({
                handle: -0.5,
                height: physics.spaceHeight,
                width: physics.spaceWidth,
            })
            .appendTo(stage);

        stage.tick(physics.tick);

        meta = Stage
            .create()
            .pin({ width: 1000, height: 1000 })
            .appendTo(stage);

        const livesStatus = Stage
            .string("text")
            .pin({ align: 0, offset: 20 })
            .appendTo(meta);

        const killStatus = Stage
            .string("text")
            .pin({ align: 0, offsetX: 20, offsetY: 50 })
            .appendTo(meta);

        const clientsStatus = Stage
            .string("text")
            .pin({ alignX: 1, offsetX: -20, offsetY: 20 })
            .appendTo(meta);

        const hsStatus = Stage
            .string("text")
            .pin({ alignX: 1, offsetX: -20, offsetY: 50 })
            .appendTo(meta);

        gameover = Stage
            .string("text")
            .value("Game Over!")
            .pin({ align: 0.5, scale: 1.6 })
            .appendTo(meta);

        function startGame() {
            gameover.hide();
        }

        function endGame() {
            gameover.show();
        }

        function updateStatus() {
            livesStatus.value("Lives:" + getHearts(physics.state.lives));
            killStatus.value("Kills: " + physics.state.level);
            clientsStatus.value("Clients: " + physics.state.connectedClients);

            let owner = "";
            let score = 0;
            const hs = JSON.parse(this.pragueView.get(this.highScoreConst));
            if (hs != null) {
                if (hs.user === this.shipUniqueId) {
                    owner = "You";
                } else {
                    owner = hs.friendlyName;
                }

                score = hs.score;
            }

            hsStatus.value("High Score(" + owner + "): " + score);
        }

        document.onkeydown = (evt) => {
            if (physics.state.gameover) {
                physics.start();
            }
            activeKeys[KEY_NAMES[evt.keyCode]] = true;
        };

        document.onkeyup = (evt) => {
            activeKeys[KEY_NAMES[evt.keyCode]] = false;
        };

        physics.start();
    }
}

// export function updateFriendlyName() {
//     const name = (document.getElementById("friendlyName") as HTMLInputElement).value;
//     (document.activeElement as HTMLElement).blur();
// }
