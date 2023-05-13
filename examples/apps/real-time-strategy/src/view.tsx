/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import React, { KeyboardEventHandler } from "react";
import * as PIXI from "pixi.js";
import { ISharedMap } from "@fluidframework/map";
import { PlayerData } from "./PlayerData";
import { IUnit, SerializableUnit } from "./SerializableUnit";
import { LocalPlayer } from "./Player";
import { Unit } from "./Unit";
import { Grid } from "./Grid";

export const diceKey = "abc";
export const containerId = "pixi-container";

export const getUniqueUnitId = (unit: IUnit) => `${unit.playerId}=${unit.id}`;

export const ReactView = (props: { localPlayer: LocalPlayer; playerMap: ISharedMap }) => {
	const { localPlayer, playerMap } = props;
	const [players] = React.useState(new Map<string, PlayerData>());
	const [sprites] = React.useState(new Map<string, PIXI.Sprite>());
	const [commandSprite] = React.useState(PIXI.Sprite.from("PlayerCommand.png"));
	// eslint-disable-next-line prefer-const
	let [unitSelected, setUnitSelected] = React.useState<number | undefined>(undefined);
	// eslint-disable-next-line prefer-const
	let [enemyUnitSelected, setEnemyUnitSelected] = React.useState<IUnit | undefined>(undefined);

	const handlePointerUpEvent = (event: PIXI.FederatedPointerEvent) => {
		const x = Math.round(event.global.x);
		const y = Math.round(event.global.y);
		console.log(`x: ${x}, y: ${y}`);

		if (enemyUnitSelected !== undefined) {
			if (localPlayer.selectedUnit !== undefined) {
				if (localPlayer.selectedUnit.playerId !== localPlayer.playerId) {
					throw new Error("selected unit is not owned by local player");
				}
				localPlayer.targetUnit(localPlayer.selectedUnit.id, enemyUnitSelected);
				localPlayer.clearSelected();
			}
			enemyUnitSelected = undefined;
			setEnemyUnitSelected(undefined);
			return;
		}

		if (
			localPlayer.selectedUnit !== undefined &&
			localPlayer.selectedUnit.playerId === localPlayer.playerId
		) {
			console.log(`moving unit ${localPlayer.selectedUnit.id}`);
			localPlayer.moveUnit(localPlayer.selectedUnit.id, { x, y });
			localPlayer.clearSelected();
			return;
		}

		if (unitSelected !== undefined) {
			console.log(`selecting unit ${unitSelected}`);
			localPlayer.selectUnit(unitSelected);
			unitSelected = undefined;
			setUnitSelected(undefined);
		}

		if (localPlayer.selectedUnit === undefined) {
			localPlayer.createUnit({ x, y });
		}
	};

	const handleKeyDownEvent: KeyboardEventHandler<HTMLDivElement> = (event) => {
		console.log(event.key);
		if (event.key === "k") {
			console.log("k pressed");
			if (localPlayer.selectedUnit === undefined) {
				return;
			}
			localPlayer.killUnit(localPlayer.selectedUnit.id);
			localPlayer.clearSelected();
		}
	};

	const update = (app: PIXI.Application) => {
		localPlayer.update();
		const unit = localPlayer.selectedUnit;
		if (unit !== undefined) {
			commandSprite.visible = true;
			app.stage.removeChild(commandSprite);
			app.stage.addChild(commandSprite);
			commandSprite.x = unit.x;
			commandSprite.y = unit.y;
		} else {
			commandSprite.visible = false;
		}
	};

	React.useEffect(() => {
		const app = new PIXI.Application();
		const createUnitSprite = (unit: SerializableUnit, playerDataOfUnit: PlayerData) => {
			const unitSprite = PIXI.Sprite.from(
				"https://s3-us-west-2.amazonaws.com/s.cdpn.io/693612/IaUrttj.png",
			);
			const healthSprite = PIXI.Sprite.from("healthBar.png");
			healthSprite.anchor.set(0.5);
			unitSprite.addChild(healthSprite);
			app.stage.addChild(unitSprite);
			unitSprite.anchor.set(0.5);
			unitSprite.x = unit.x;
			unitSprite.y = unit.y;
			sprites.set(getUniqueUnitId(unit), unitSprite);
			unitSprite.tint = playerDataOfUnit.playerColor;
			unitSprite.interactive = true;
			grid.updateUnitOnGrid(unit);
			if (unit.playerId === localPlayer.playerId) {
				unitSprite.on("pointerup", () => {
					console.log(`clicked on unit ${unit.id}`);
					setUnitSelected(unit.id);
					unitSelected = unit.id;
					console.log(unitSelected);
				});
			} else {
				unitSprite.on("pointerup", () => {
					console.log(`clicked on enemy unit ${unit.id}`);
					setEnemyUnitSelected(unit);
					enemyUnitSelected = unit;
				});
			}
		};

		const setupPlayer = (player: PlayerData, gameGrid: Grid) => {
			players.set(player.playerId, player);
			player.units.forEach((unit) => {
				createUnitSprite(unit, player);
			});
			player.on("createUnit", createUnitSprite);
			player.on("killUnit", (unit: IUnit) => {
				console.log(`killing unit ${unit.id}`);
				sprites.get(getUniqueUnitId(unit))?.destroy();
				sprites.delete(getUniqueUnitId(unit));
				gameGrid.deleteUnitOnGrid(unit);
			});
			player.on("updateUnit", (unit: IUnit) => {
				const sprite = sprites.get(getUniqueUnitId(unit));
				if (sprite === undefined) {
					throw new Error(`sprite not found for unit ${getUniqueUnitId(unit)}`);
				}
				sprite.x = unit.x;
				sprite.y = unit.y;
				const healthBar = sprite.children[0] as PIXI.Sprite;
				healthBar.width = (30 * unit.health) / Unit.health;
				gameGrid.updateUnitOnGrid(unit);
			});
		};

		document.getElementById(containerId)?.appendChild((app as any).view);
		app.stage.on("pointerup", handlePointerUpEvent);
		app.stage.interactive = true;
		app.stage.hitArea = app.renderer.screen;
		app.stage.addChild(commandSprite);
		commandSprite.anchor.set(0.5);
		app.ticker.autoStart = true;
		app.ticker.add(() => update(app));
		const grid = new Grid(app.view.width, app.view.height);
		Array.from(playerMap.values()).forEach((handle: IFluidHandle<PlayerData>) => {
			void handle.get().then((player) => {
				setupPlayer(player, grid);
			});
		});
		playerMap.on("valueChanged", (changed) => {
			const playerHandle = playerMap.get(changed.key) as IFluidHandle<PlayerData>;
			void playerHandle.get().then((player) => {
				setupPlayer(player, grid);
			});
		});
		localPlayer.setState(players, grid);
		return () => {
			document.getElementById(containerId)?.removeChild((app as any).view);
			app.stage.off("pointerup", handlePointerUpEvent);
		};
	}, []);

	return (
		<div style={{ textAlign: "center" }} tabIndex={0} onKeyDown={handleKeyDownEvent}>
			<h1>RTS Game</h1>

			<div id={containerId}></div>
		</div>
	);
};
