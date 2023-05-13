import { IUnit } from "./SerializableUnit";
import { getUniqueUnitId } from "./view";

class GridPoint {
	x: number;
	y: number;
	public readonly units: IUnit[] = [];
	constructor (x: number, y: number) {
		this.x = x;
		this.y = y;
	}

	public getUnitIndex(unit: IUnit): number {
		return this.units.findIndex((u) => u.playerId === unit.playerId && u.id === unit.id)
	}

	public hasUnit(unit: IUnit) {
		return this.getUnitIndex(unit) >= 0;
	}
}

export const gridSize = 20;

export class Grid {
	grid: GridPoint[][];
	unitToGridMap = new Map<string, GridPoint>();
	constructor (private readonly width: number, private readonly height: number) {
		console.log(`Width: ${width}, Height: ${height}, Widths: ${width/gridSize}, Heights: ${height/gridSize}`)
		this.grid = [];
		for (let i = 0; i <= this.width; i+=gridSize) {
			const row: GridPoint[] = [];
			this.grid.push(row);
			for (let j = 0; j <= this.height; j+=gridSize) {
				row.push(new GridPoint(i, j));
			}
		}
	}

	public updateUnitOnGrid(unit: IUnit) {
		this.deleteUnitOnGrid(unit);
		const newGridPoint = this.getGridPoint(unit.x, unit.y);
		newGridPoint.units.push(unit);
		this.unitToGridMap.set(getUniqueUnitId(unit), newGridPoint);
	}

	public deleteUnitOnGrid(unit: IUnit) {
		const gridPoint = this.unitToGridMap.get(getUniqueUnitId(unit));
		if (gridPoint !== undefined) {
			const index = gridPoint.getUnitIndex(unit);
			if (index === -1) {
				return;
			}
			gridPoint.units.splice(index, 1);
		}
	}

	public getUnitsInRadius(x: number, y: number, radius: number): IUnit[] {
		const units: IUnit[] = [];
		const gridPoint = this.getGridPoint(x, y);
		for (let i = gridPoint.x - radius; i <= gridPoint.x + radius; i+=gridSize) {
			for (let j = gridPoint.y - radius; j <= gridPoint.y + radius; j+=gridSize) {
				if (i < 0 || j < 0 || i > this.width || j > this.height) {
					continue;
				}
				const gridPoint = this.getGridPoint(i, j);
				units.push(...gridPoint.units);
			}
		}
		return units;
	}

	public getGridPoint(x: number, y: number): GridPoint {
		const width = Math.round(x/gridSize);
		const height = Math.round(y/gridSize);
		return this.grid[width][height];
	}
}