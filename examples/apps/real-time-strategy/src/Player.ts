import { Grid, gridSize } from "./Grid";
import { PlayerData } from "./PlayerData";
import { IUnit } from "./SerializableUnit";
import { Unit } from "./Unit";
import { IPosition } from "./position";
import { getUniqueUnitId } from "./view";

const actionMultiplier = 2;

export class LocalPlayer {

	private unitId?: number;
	private movementMap = new Map<number, IPosition>();
	private targetMap = new Map<number, IUnit>();
	private weakTargetMap = new Map<number, IUnit>();
	private _players?: Map<string, PlayerData>;
	private _grid?: Grid;

	constructor(private readonly localPlayerData: PlayerData) {
		
	}

	public setState(players: Map<string, PlayerData>, grid: Grid) {
		this._players = players;
		this._grid = grid;
	}

	public get players(): Map<string, PlayerData> {
		if (this._players === undefined) {
			throw new Error("Players not set!");
		}
		return this._players;
	}

	public get grid(): Grid {
		if (this._grid === undefined) {
			throw new Error("Grid not set!");
		}
		return this._grid;
	}

	public moveUnit(id: number, position: IPosition) {
		this.clearCommands(id);
		this.movementMap.set(id, position);
	}

	public createUnit(position: IPosition) {
		this.localPlayerData.createUnit(position);
	}

	public killUnit(id: number) {
		this.localPlayerData.killUnit(id);
	}

	public targetUnit(id: number, target: IUnit) {
		console.log(`Unit ${id} targeting ${getUniqueUnitId(target)}`);
		this.clearCommands(id);
		this.targetMap.set(id, target);
	}

	private weakTargetUnit(id: number, target: IUnit) {
		if (this.movementMap.has(id) || this.targetMap.has(id)) {
			throw new Error(`Unit ${id} already has a command!`);
		}
		console.log(`Unit ${id} weak targeting ${getUniqueUnitId(target)}`);
		this.weakTargetMap.set(id, target);
	}

	private clearCommands(id: number) {
		this.weakTargetMap.delete(id);
		this.movementMap.delete(id);
		this.targetMap.delete(id);
	}

	public get playerId() {
		return this.localPlayerData.playerId;
	};

	public selectUnit(id: number): void {
		this.unitId = id;
	}

	public clearSelected(): void {
		console.log(`Clear selected ${this.unitId}`);
		this.unitId = undefined;
	}

	public get selectedUnit(): IUnit | undefined {
		if (this.unitId === undefined) {
			return undefined;
		}
		return this.localPlayerData.getUnit(this.unitId.toString());
	}

	public handleTargeting(targetMap: Map<number, IUnit>, damageMultiplier: number = 1, speedMultiplier: number = 1): void {
		for (const [id, targetIds] of targetMap.entries()) {
			const unit = this.localPlayerData.getUnit(id.toString());
			const targetPlayer = this.players.get(targetIds.playerId);
			const target = targetPlayer?.getUnit(targetIds.id.toString());
			if (target === undefined || unit === undefined || targetPlayer === undefined) {
				targetMap.delete(id);
				continue;
			}

			if (distanceSquared(unit, target) > (Unit.searchRange + gridSize) ** 2 && damageMultiplier === 1 && speedMultiplier === 1) {
				targetMap.delete(id);
				continue;
			}

			const newPosition = calculateNewUnitPositionWithCollision(unit, target, this.grid, speedMultiplier);
			if (unitIsInRange(newPosition, target)) {
				targetPlayer.damageUnit(target.id, Unit.damage * damageMultiplier);
				if (target.health <= 0) {
					console.log(`Target died ${target.id}`);
					targetMap.delete(id);
				}
			} else {
				this.localPlayerData.moveUnit(unit.id, newPosition);
			}
		}
	}

	public update(): void {
		for (const [id, position] of this.movementMap.entries()) {
			const unit = this.localPlayerData.getUnit(id.toString());
			if (unit === undefined) {
				this.movementMap.delete(id);
				continue;
			}
			const newPosition = calculateNewUnitPositionWithCollision(unit, position, this.grid, actionMultiplier);
			if (unitHasArrived(unit, position)) {
				this.movementMap.delete(id);
			}
			this.localPlayerData.moveUnit(id, newPosition);
		}

		this.handleTargeting(this.targetMap, actionMultiplier, actionMultiplier);
		this.handleTargeting(this.weakTargetMap);

		for (const unit of this.localPlayerData.units) {
			if (unit.health <= 0 || this.movementMap.has(unit.id) || this.targetMap.has(unit.id) || this.weakTargetMap.has(unit.id)) {
				continue;
			}
			const searchableUnits = this.grid.getUnitsInRadius(unit.x, unit.y, Unit.searchRange);
			const enemyUnits = searchableUnits.filter((searchableUnit) => searchableUnit.playerId !== unit.playerId);
			if (enemyUnits.length === 0) {
				continue;
			}
			let closestEnemyUnit = enemyUnits[0];
			let closestDistance = distanceSquared(unit, closestEnemyUnit);
			for (const enemyUnit of enemyUnits) {
				const distance = distanceSquared(unit, enemyUnit);
				if (distance < closestDistance) {
					closestEnemyUnit = enemyUnit;
					closestDistance = distance;
				}
			}
			this.weakTargetUnit(unit.id, closestEnemyUnit);
		}
	}
}

function calculateNewUnitPositionWithCollision(unit: IUnit, target: IPosition, grid: Grid, speedMultiplier: number = 1): IPosition {
	const distanceX = target.x - unit.x;
	const distanceY = target.y - unit.y;
	if (distanceX === 0 && distanceY === 0) {
		return { x: unit.x, y: unit.y };
	}
	const deltaX = distanceX / Math.sqrt(distanceX ** 2 + distanceY ** 2) * Unit.speed * speedMultiplier;
	const deltaY = distanceY / Math.sqrt(distanceX ** 2 + distanceY ** 2) * Unit.speed * speedMultiplier;
	const newX = unit.x + deltaX;
	const newY = unit.y + deltaY;
	
	// Collision detection
	const newGridPoint = grid.getGridPoint(newX, newY);
	if (newGridPoint.units.length > 0 && !newGridPoint.hasUnit(unit)) {
		return { x: unit.x, y: unit.y };
	}

	return { x: newX, y: newY };
}

function unitHasArrived(unit: IPosition, target: IPosition): boolean {
	return Math.round(unit.x) === Math.round(target.x) && Math.round(unit.y) === Math.round(target.y);
}

function unitIsInRange(unit: IPosition, target: IPosition): boolean {
	const distanceX = target.x - unit.x;
	const distanceY = target.y - unit.y;
	return (distanceX ** 2 + distanceY ** 2) <= Unit.range ** 2;
}

function distanceSquared(a: IPosition, b: IPosition): number {
	return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}