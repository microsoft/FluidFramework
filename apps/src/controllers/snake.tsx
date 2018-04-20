import { api, socketStorage, types } from "@prague/routerlicious/dist/client-api";

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
            } else {
                rootView.set("game", doc.createMap());
                gameMap = rootView.get("game") as types.IMap;
                gameView = await gameMap.getView();
            }

            if (! (await gameMap.has("player1"))) {
                playerId = 1;
                await gameMap.set("player1Id", playerId);
                moves = await gameMap.set("player1", doc.createMap());
            } else if (! (await gameMap.has("player2"))) {
                playerId = 2;
                await gameMap.set("player2Id", playerId);
                moves = await gameMap.set("player2", doc.createMap());
            } else if (! (await gameMap.has("player3"))) {
                playerId = 3;
                await gameMap.set("player3Id", playerId);
                moves = await gameMap.set("player3", doc.createMap());
            } else if (! (await gameMap.has("player4"))) {
                playerId = 4;
                await gameMap.set("player4Id", playerId);
                moves = await gameMap.set("player4", doc.createMap());
            } else {
                canJoin = false;
            }
            console.log(moves);

            if (!canJoin) {
                console.log(`${playerId} can't join the game!`);
                displayError($("#snakeViews"), "No more players allowed");
            } else {
                console.log(`${playerId} can join the game!`);
                ReactDOM.render(
                    <GameBoard gameMap={gameMap} gameView={gameView} moves={moves} width={100} height={100}
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
