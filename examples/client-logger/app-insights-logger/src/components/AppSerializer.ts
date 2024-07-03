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
	public effectResultIteration: number;

	constructor(
		dependencies: Dependency<any>[],
		private readonly effect: () => V,
	) {
		this.prevValues = dependencies.map((dep) => dep.getValue());
		this.dependencies = dependencies;
		// initialize effect results
		this.effectResult = this.effect();
		this.effectResultIteration = 0;
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
			const newEffect = this.effect();
			if (this.effectResult != newEffect) {
				this.effectResultIteration += 1;
			}
			this.effectResult = this.effect();
		}
	}
}

export class AppSerializer {
	private readonly lastSerialization: string | undefined;
	private readonly intervalId: number | undefined;
	private readonly segmentIterationCounts: number[];

	constructor(
		private readonly segments: MultiDepTracker<string>[],
		private readonly intervalMs: number,
		private readonly destination: ISharedCell,
	) {
		this.segmentIterationCounts = [];
		for (let i = 0; i < segments.length; i++) {
			this.segmentIterationCounts[i] = segments[i].effectResultIteration;
		}

		this.intervalId = setInterval(() => {
			// If atleast one segment has changed, we should resave the serialized state.
			if (this.hasASegmentChanged()) {
				let serialization = "";

				this.segments.forEach((segment) => {
					serialization += segment.effectResult;
				});

				console.log("Saving serialized app to shared cell: \n", serialization);
				if (this.lastSerialization !== serialization)
					this.destination.set(`APPSERAILIZERFILETYPEHEADER::::${serialization}`);
			} else {
				console.log("Skipping saving app serialization because no changes were detected");
			}
		}, this.intervalMs);

		console.log("new AppSerilaizer instance created with intervalId id", this.intervalId);
	}

	/**
	 * By keeping track of the last known iteration count on each segment, we can
	 * loop over each segment and both update the last know iteraction count and determine if
	 * atleast one segment has a new change.
	 */
	hasASegmentChanged(): boolean {
		let hasASegmentChanged = false;
		for (let i = 0; i < this.segments.length; i++) {
			const segment = this.segments[i];
			const lastSegmentIterationCount = this.segmentIterationCounts[i];
			if (lastSegmentIterationCount < segment.effectResultIteration && segment.effectResult) {
				hasASegmentChanged = true;
				this.segmentIterationCounts[i] = segment.effectResultIteration;
			}
		}
		return hasASegmentChanged;
	}

	stop() {
		console.log("new AppSerilaizer intervalId stopped", this.intervalId);
		clearInterval(this.intervalId);
	}
}
