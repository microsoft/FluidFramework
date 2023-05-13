import { IPosition } from "./position";

export interface IUnit extends IPosition {
	health: number;
	id: number;
	playerId: string;
}

export class SerializableUnit implements IUnit {
	public health = 100;
	constructor(
		public x: number, 
		public y: number,
		public id: number,
		public playerId: string,
	) {
	}
}