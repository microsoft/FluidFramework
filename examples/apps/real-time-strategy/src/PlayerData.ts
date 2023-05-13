import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedMap } from "@fluidframework/map";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IUnit, SerializableUnit } from "./SerializableUnit";
import { IPosition } from "./position";

const playerIdKey = "playerId";
const playerRegistryKey = "playerRegistry";
const unitMapKey = "unitMap";
const playerColorKey = "playerColor";

export class PlayerData extends DataObject {
	public static readonly factory = new DataObjectFactory(
		playerRegistryKey,
		PlayerData,
		[SharedMap.getFactory()],
		{},
	);
	private _unitMap?: SharedMap;
	private unitCounter = 0;

	public get playerId(): string {
		const id = this.root.get<string>(playerIdKey);
		if (id === undefined) {
			throw new Error("Player ID is undefined");
		}
		return id;
	}

	public set playerId(id: string) {
		if (this.root.get(playerIdKey) !== undefined) {
			throw new Error("Player ID is should not be defined when being set!");
		}
		this.root.set(playerIdKey, id);
	}

	private get unitMap(): SharedMap {
		if (this._unitMap === undefined) {
			throw new Error("Unit map is undefined");
		}
		return this._unitMap;
	}

	public get units(): IUnit[] {
		const array = Array.from(this.unitMap.values()) as IUnit[];
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return array;
	}

	public get playerColor(): number {
		const color = this.root.get<number>(playerColorKey);
		if (color === undefined) {
			throw new Error("Player color is undefined");
		}
		return color;
	}

	public getUnit(unitId: string): IUnit | undefined {
		return this.unitMap.get(unitId);
	}

	public createUnit(position: IPosition): IUnit {
		const id = this.unitCounter++;
		const unit = new SerializableUnit(position.x, position.y, id, this.playerId);
		this.unitMap.set(id.toString(), unit);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return unit;
	}

	public killUnit(id: number): void {
		this.unitMap.delete(id.toString());
	}

	public damageUnit(id: number, damage: number): void {
		const unit = this.unitMap.get(id.toString());
		if (unit === undefined) {
			return;
		}
		unit.health -= damage;
		if (unit.health <= 0) {
			this.killUnit(id);
		} else {
			this.unitMap.set(id.toString(), unit);
		}
	}

	public moveUnit(id: number, position: IPosition): void {
		const unit = this.unitMap.get(id.toString());
		if (unit === undefined) {
			console.log(`Missing unit ${id}!`);
			return;
		}
		unit.x = position.x;
		unit.y = position.y;
		this.unitMap.set(id.toString(), unit);
	}

	protected async initializingFirstTime(props?: any): Promise<void> {
		this._unitMap = SharedMap.create(this.runtime);
		this.root.set(unitMapKey, this._unitMap.handle);
		this.root.set(playerColorKey, Math.random() * 0xffffff);
	}

	protected async initializingFromExisting(): Promise<void> {
		this._unitMap = await this.getMap(unitMapKey);
	}

	protected async hasInitialized(): Promise<void> {
		this.unitMap.on("valueChanged", (changed) => {
			const prevUnit = changed.previousValue;
			const newUnit = this.unitMap.get<IUnit>(changed.key);
			if (prevUnit === undefined && newUnit === undefined) {
				throw new Error("Created an empty unit!");
			}
			if (prevUnit === undefined) {
				console.log("Create unit");
				this.emit("createUnit", newUnit, this);
				return;
			}

			if (newUnit === undefined) {
				console.log("Kill unit");
				this.emit("killUnit", prevUnit);
				return;
			}

			this.emit("updateUnit", newUnit);
		});
	}

	private async getMap(mapKey: string): Promise<SharedMap> {
		const handle = this.root.get<IFluidHandle<SharedMap>>(mapKey);
		if (handle === undefined) {
			throw new Error("Unit map handle is undefined");
		}
		return handle.get();
	}
}
