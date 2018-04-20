import { api, map, socketStorage, types } from "@prague/routerlicious/dist/client-api";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { GameBoard } from "./components/snake/gameBoard";

async function loadDocument(id: string, token?: string): Promise<api.Document> {
    console.log("Loading in root document...");
    const document = await api.load(id, { encrypted: false, token }).catch((err) => {
        return Promise.reject(err);
    });

    console.log("Document loaded");
    return document;
}

function displayError(parentElement: JQuery, error: string) {
    const idElement = $(`<h2>${error}</h2>`);
    parentElement.append(idElement);
}

async function setMaps(gameMap: types.IMap, doc: api.Document): Promise<void> {

    const gameCounter: map.Counter = await gameMap.get("gameCounter");

    const p1Map = await gameMap.set("player1", doc.createMap());
    await p1Map.set("lastMove", "ArrowLeft");
    const p2Map = await gameMap.set("player2", doc.createMap());
    await p2Map.set("lastMove", "ArrowRight");
    const p3Map = await gameMap.set("player3", doc.createMap());
    await p3Map.set("lastMove", "ArrowDown");
    const p4Map = await gameMap.set("player4", doc.createMap());
    await p4Map.set("lastMove", "ArrowUp");

    gameCounter.onIncrement = (val) => {
        const count = gameCounter.value;
        p1Map.set("gameCounter", count);
        p2Map.set("gameCounter", count);
        p3Map.set("gameCounter", count);
        p4Map.set("gameCounter", count);
    };
}

export async function load(id: string, repository: string,  owner: string, endPoints: any, token?: string) {
    $("document").ready(() => {
        socketStorage.registerAsDefault(endPoints.delta, endPoints.storage, owner, repository);
        loadDocument(id, token).then(async (doc: api.Document) => {
            // tslint:disable-next-line
            window["doc"] = doc;
            const playerName = doc.getUser().user.name;
            let playerId: number;
            // Set up Collaborative Types and Player Numbers
            const rootView = await doc.getRoot().getView();

            let gameMap: types.IMap;
            let gameView: types.IMapView;
            let moves: types.IMap;
            let gameCounter: map.Counter;
            let canJoin: boolean = true;

            /*
            1. if !has game create it
            2. create players 2-4
            3. Each player gets an array
            docker build --build-arg NPM_TOKEN=$(echo $NPM_TOKEN) -t apps .
            docker run -p 7000:3000 apps
            */

            if (rootView.has("game")) {
                gameMap = rootView.get("game") as types.IMap;
                gameView = await gameMap.getView();
                gameCounter = gameView.get("gameCounter");
            } else {
                rootView.set("game", doc.createMap());
                gameMap = rootView.get("game") as types.IMap;
                gameView = await gameMap.getView();
                gameCounter = gameView.set<map.Counter>("gameCounter", undefined, map.CounterValueType.Name);
                await setMaps(gameMap, doc);
                setInterval(() => {
                    gameCounter.increment(1);
                }, 1000);
            }

            if (! (await gameMap.has("player1Id"))) {
                playerId = 1;
                await gameMap.set("player1Id", playerId);
                moves = gameView.get("player1");
                await moves.set("playerStart", gameCounter.value);
            } else if (! (await gameMap.has("player2Id"))) {
                playerId = 2;
                await gameMap.set("player2Id", playerId);
                moves = gameView.get("player2");
                await moves.set("playerStart", gameCounter.value);
            } else if (! (await gameMap.has("player3Id"))) {
                playerId = 3;
                await gameMap.set("player3Id", playerId);
                moves = gameView.get("player3");
                await moves.set("playerStart", gameCounter.value);
            } else if (! (await gameMap.has("player4Id"))) {
                playerId = 4;
                await gameMap.set("player4Id", playerId);
                moves = gameView.get("player4");
                await moves.set("playerStart", gameCounter.value);
            } else {
                canJoin = false;
            }

            if (!canJoin) {
                console.log(`${playerId} can't join the game!`);
                displayError($("#snakeViews"), "No more players allowed");
            } else {
                const movesView = await moves.getView();
                console.log(`${playerId} can join the game!`);
                ReactDOM.render(
                    <GameBoard gameMap={gameMap} gameView={gameView} moves={movesView} width={100} height={100}
                                playerId={playerId} playerName={playerName}/>,
                    document.getElementById("snakeViews"),
                );
            }

        }, (err) => {
            displayError($("#snakeViews"), JSON.stringify(err));
            console.log(err);
        });
    });
}
