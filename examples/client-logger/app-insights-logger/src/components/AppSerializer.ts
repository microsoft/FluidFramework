import { ISharedCell } from "@fluidframework/cell/internal";

export type Dependency<T> = {
	/**
	 * function to get the value of the dependency
	 */
	getValue: () => T;
	/**
	 * Qualifies if the incoming change should trigger any effects
	 */
	qualifier?: (prevValue: T, newValue: T) => boolean;
};

/**
 * Takes an array of dependencies and executes and produces a specified effect when the dependencies change
 */
export class MultiDepTracker<V> {
	private prevValues: unknown[];
	public effectResult: V | undefined;

	constructor(
		dependencies: Dependency<any>[],
		private readonly effect: () => V,
	) {
		this.prevValues = dependencies.map((dep) => dep.getValue());
		this.dependencies = dependencies;
		// initialize effect results
		this.effectResult = this.effect();
	}

	public dependencies: Dependency<any>[];

	public trigger() {
		let shouldTriggerEffect = false;

		this.dependencies.forEach((dep, index) => {
			const newVal = dep.getValue();
			const prevVal = this.prevValues[index];
			// console.log(`comparing ${prevVal} to ${newVal}`);

			if (dep.qualifier) {
				if (dep.qualifier(prevVal, newVal)) {
					// console.log("qualifier change is TRUE");
					shouldTriggerEffect = true;
					this.prevValues[index] = newVal;
				} else {
					// console.log("qualifier change is false");
				}
			} else {
				if (prevVal !== newVal) {
					// console.log("straight check change Triggered");
					shouldTriggerEffect = true;
					this.prevValues[index] = newVal;
				}
			}
		});

		if (shouldTriggerEffect) {
			this.effectResult = this.effect();
		}
	}
}

export class AppSerializer {
	private readonly lastSerialization: string | undefined;
	private readonly intervalId: number | undefined;
	constructor(
		private readonly segments: MultiDepTracker<string>[],
		private readonly intervalMs: number,
		private readonly destination: ISharedCell,
	) {
		this.intervalId = setInterval(() => {
			let serialization = "";
			this.segments.forEach((segment) => {
				if (segment.effectResult) {
					serialization += segment.effectResult;
				}
			});
			console.log("Saving serialized app to shared cell: \n", serialization);
			if (this.lastSerialization !== serialization)
				this.destination.set(`APPSERAILIZERFILETYPEHEADER::::${serialization}`);
		}, this.intervalMs);
		console.log("new AppSerilaizer instance created with intervalId id", this.intervalId);
	}

	stop() {
		console.log("new AppSerilaizer intervalId stopped", this.intervalId);
		clearInterval(this.intervalId);
	}
}
