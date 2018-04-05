import { api } from "@prague/routerlicious";

import prague = api;
import types = prague.types;

async function loadDocument(id: string, token?: string): Promise<prague.api.Document> {
    console.log("Loading in root document...");
    const document = await prague.api.load(id, { encrypted: false, token }).catch((err) => {
        return Promise.reject(err);
    });

    console.log("Document loaded");
    return document;
}

function startPlaying(gameMap: types.IMap, gameView: types.IMapView, playerId: number) {
    gameMap.on("valueChanged", (delta: types.IValueChanged) => {
        const key = delta.key;
        const parsedKey = parseInt(key, 10);
        if (!isNaN(parsedKey)) {
            const currentPlayerId = gameView.get(key) as number;
            if (currentPlayerId === playerId) {
                return;
            }

            if (gameView.has("restart")) {
                const restartMode = gameView.get("restart") as boolean;
                if (restartMode) {
                    return;
                }
            }

            const occupied = [];
            for (const cell of gameView.keys()) {
                const parsed = parseInt(cell, 10);
                if (isNaN(parsed)) {
                    continue;
                }
                occupied.push(parsed);
            }
            let nextMoveIndex = -1;
            for (let i = 0; i < 9; ++i) {
                if (occupied.indexOf(i) === -1) {
                    nextMoveIndex = i;
                    break;
                }
            }
            if (nextMoveIndex === -1) {
                console.log(`Game over!`);
            } else {
                // Delay for two seconds to simulate human player.
                setTimeout(() => {
                    gameView.set("next", 1);
                    gameView.set(nextMoveIndex.toString(), playerId);
                }, 1000);
            }
        }
    });
}

export function start(id: string, repository: string,  owner: string, endPoints: any) {
    prague.socketStorage.registerAsDefault(endPoints.delta, endPoints.storage, owner, repository);
    setTimeout(() => {
        console.log(`Bot started after 5 seconds!`);
        loadDocument(id).then(async (doc) => {
            const playerName = "Bot";
            const playerId = 2;

            const rootView = await doc.getRoot().getView();
            let gameMap: types.IMap;
            let gameView: types.IMapView;
            if (rootView.has("game")) {
                gameMap = rootView.get("game") as types.IMap;
                gameView = await gameMap.getView();
                gameView.set("pl2", playerName);
                console.log(`Updated playername into map!`);
            }

            let canJoin: boolean = true;
            if (gameView.has("counter")) {
                const counter = gameView.get("counter") as api.map.Counter;
                if (counter.value === 2) {
                    canJoin = false;
                } else {
                    counter.increment(1);
                    console.log(`Incremented map counter!`);
                }
            }

            if (!canJoin) {
                console.log(`${playerId} can't join the game!`);
            } else {
                console.log(`${playerId} can join the game!`);
                startPlaying(gameMap, gameView, playerId);
            }
        }, (err) => {
            console.log(err);
        });
    }, 3500);
}
