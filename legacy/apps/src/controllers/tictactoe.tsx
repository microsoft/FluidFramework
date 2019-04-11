import { api } from "@prague/routerlicious";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { TicTacToe } from "./components/tictactoe/Game";

import prague = api;
import types = prague.types;
import Map = api.map;

async function loadDocument(id: string, token?: string): Promise<prague.api.Document> {
    console.log("Loading in root document...");
    const document = await prague.api.load(id, { encrypted: false, token }).catch((err) => {
        return Promise.reject(err);
    });

    console.log("Document loaded");
    return document;
}

function displayError(parentElement: JQuery, error: string) {
    const idElement = $(`<h2>${error}</h2>`);
    parentElement.append(idElement);
}

export async function load(id: string, tenantId: string, endPoints: any, token?: string) {
    $("document").ready(() => {
        prague.socketStorage.registerAsDefault(endPoints.delta, endPoints.storage, tenantId);
        loadDocument(id, token).then(async (doc) => {
            // tslint:disable-next-line
            window["doc"] = doc;
            const plName = doc.getUser().id;
            const playerName = plName.indexOf("@") === -1 ? plName : plName.substring(0, plName.indexOf("@"));
            let playerId: number;
            let rootView: types.IMapView;
            let gameMap: types.IMap;
            let gameView: types.IMapView;
            let canJoin: boolean = true;

            // First player is responsible for creating the map objects.
            if (!doc.existing) {
                playerId = 1;
                rootView = await doc.getRoot().getView();
                rootView.set("game", doc.createMap());
                gameMap = rootView.get("game") as types.IMap;
                gameView = await gameMap.getView();
                gameView.set("pl1", playerName);
                const counter = gameView.set<Map.Counter>("counter", undefined, Map.CounterValueType.Name);
                counter.increment(1);
                gameView.set("next", playerId);
            } else {    // Second player waits for all map objects to be created first.
                playerId = 2;
                rootView = await doc.getRoot().getView();
                await waitForMapObject(rootView, "game");
                gameMap = rootView.get("game") as types.IMap;
                gameView = await gameMap.getView();
                await waitForMapObject(gameView, "counter");
                const counter = gameView.get("counter") as api.map.Counter;
                if (counter.value === 2) {
                    canJoin = false;
                } else {
                    counter.increment(1);
                    gameView.set("pl2", playerName);
                }
            }
            if (!canJoin) {
                console.log(`this player can't join the game!`);
                displayError($("#tictactoeViews"), "No more players allowed");
            } else {
                console.log(`${playerId} can join the game!`);
                const player = {
                    id: playerId,
                    name: playerName,
                };
                ReactDOM.render(
                    <TicTacToe player={player} gameMap={gameMap} gameView={gameView}/>,
                    document.getElementById("tictactoeViews"),
                );
            }
        }, (err) => {
            displayError($("#tictactoeViews"), JSON.stringify(err));
            console.log(err);
        });
    });
}

function waitForMapObject(root: types.IMapView, id: string): Promise<void> {
    return new Promise<void>((resolve, reject) => pollMap(root, id, resolve, reject));
}

function pollMap(root: types.IMapView, id: string, resolve, reject) {
    if (root.has(id)) {
        resolve();
    } else {
        const pauseAmount = 50;
        console.log(`Did not find taskmap - waiting ${pauseAmount}ms`);
        setTimeout(() => pollMap(root, id, resolve, reject), pauseAmount);
    }
}
