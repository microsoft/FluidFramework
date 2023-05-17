/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedCell, SharedCell } from "@fluidframework/cell";
import { IEvent } from "@fluidframework/common-definitions";
import { assert, TypedEventEmitter } from "@fluidframework/common-utils";
import { FluidDataStoreRuntime } from "@fluidframework/datastore";
import { IChannelFactory, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import {
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";

export interface IDiceRollerEvents extends IEvent {
	(event: "diceRolled", listener: () => void);
	(event: "disposed", listener: () => void);
}

/**
 * IDiceRoller describes the public API surface for our dice roller data object.
 */
export interface IDiceRoller extends TypedEventEmitter<IDiceRollerEvents> {
	/**
	 * Get the dice value as a number.
	 */
	readonly value: number;

	/**
	 * Roll the dice.  Will cause a "diceRolled" event to be emitted.
	 */
	roll: () => void;

	/**
	 * When the dice roller is disposed, it is no longer able to roll or receive updates from other clients.
	 */
	readonly disposed: boolean;
}

const diceCellId = "diceCell";

/**
 * The DiceRoller is our data object that implements the IDiceRoller interface.
 */
class DiceRoller extends TypedEventEmitter<IDiceRollerEvents> implements IDiceRoller {
	private _disposed = false;

	public get disposed() {
		return this._disposed;
	}

	public get handle() {
		// DiceRollerFactory already provides an entryPoint initialization function to the data store runtime,
		// so this object should always have access to a non-null entryPoint.
		assert(this.runtime.entryPoint !== undefined, "EntryPoint was undefined");
		return this.runtime.entryPoint;
	}

	public constructor(
		// Here I'm still passing through a full runtime, but really it would probably be better to just pass through
		// the specific capabilities that the data object requires.
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly diceCell: ISharedCell<number>,
	) {
		super();

		if (this.runtime.disposed) {
			this.dispose();
		} else {
			this.runtime.once("dispose", this.dispose);
		}

		this.diceCell.on("valueChanged", () => {
			this.emit("diceRolled");
		});
	}

	public get value() {
		// The cell is guaranteed to already be initialized with a value.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.diceCell.get()!;
	}

	public readonly roll = () => {
		const rollValue = Math.floor(Math.random() * 6) + 1;
		this.diceCell.set(rollValue);
	};

	/**
	 * Called when the host container closes and disposes itself
	 */
	private readonly dispose = (): void => {
		this._disposed = true;
		this.emit("disposed");
	};
}

const sharedCellFactory = SharedCell.getFactory();
const diceRollerSharedObjectRegistry = new Map<string, IChannelFactory>([
	[sharedCellFactory.type, sharedCellFactory],
]);

export class DiceRollerFactory implements IFluidDataStoreFactory {
	public get type(): string {
		throw new Error("Do not use the type on the data store factory");
	}

	public get IFluidDataStoreFactory() {
		return this;
	}

	// Effectively, this pattern puts the factory in charge of "unpacking" the context, getting everything ready to assemble the DiceRoller
	// As opposed to the DiceRoller instance having an initialize() method to be called after the fact that does the unpacking.
	public async instantiateDataStore(context: IFluidDataStoreContext, existing: boolean) {
		const runtime: FluidDataStoreRuntime = new FluidDataStoreRuntime(
			context,
			diceRollerSharedObjectRegistry,
			existing,
			// We have to provide a callback here to get an entryPoint, otherwise we would just omit it if we could always get an entryPoint.
			async () => instance,
		);

		let diceCell: ISharedCell;
		if (existing) {
			diceCell = (await runtime.getChannel(diceCellId)) as ISharedCell;
		} else {
			diceCell = runtime.createChannel(diceCellId, sharedCellFactory.type) as SharedCell;
			diceCell.bindToContext();
			diceCell.set(1);
		}

		// By this point, we've performed any async work required to get the dependencies of the DiceRoller,
		// so just a normal sync constructor will work fine (no followup async initialize()).
		const instance = new DiceRoller(runtime, diceCell);

		return runtime;
	}
}
