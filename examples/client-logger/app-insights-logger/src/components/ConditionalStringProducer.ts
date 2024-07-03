import { ISharedCell } from "@fluidframework/cell/internal";
// import type { IFluidHandle } from "@fluidframework/core-interfaces";
// import { useEffect, useState } from "react";

// type QualifierFunction<T> = (newValue: T, oldValue: T | undefined) => boolean;

// interface Dependency<T> {
// 	value: T;
// 	qualifier: QualifierFunction<T>;
// }

// export class ConditionalStringProducer<T> {
// 	private dependencies: Map<string, Dependency<T>>;
// 	private changeTracker: Map<string, T | null>;

// 	constructor(s
// 		initialDependencies: { [key: string]: T },
// 		qualifiers: { [key: string]: QualifierFunction<T> },
// 	) {
// 		this.dependencies = new Map();
// 		this.changeTracker = new Map();

// 		for (const key in initialDependencies) {
// 			if (initialDependencies.hasOwnProperty(key) && qualifiers.hasOwnProperty(key)) {
// 				this.dependencies.set(key, {
// 					value: initialDependencies[key],
// 					qualifier: qualifiers[key],
// 				});
// 				this.changeTracker.set(key, null);
// 			}
// 		}
// 	}

// 	updateDependency(key: string, newValue: T): void {
// 		if (this.dependencies.has(key)) {
// 			const dependency = this.dependencies.get(key)!;
// 			const oldValue = dependency.value;

// 			if (dependency.qualifier(newValue, oldValue)) {
// 				dependency.value = newValue;
// 				this.changeTracker.set(key, oldValue);
// 				this.produceString();
// 			}
// 		} else {
// 			throw new Error(`Dependency with key ${key} does not exist.`);
// 		}
// 	}

// 	produceString(): string {
// 		let result = "";
// 		for (const [key, dependency] of this.dependencies.entries()) {
// 			const oldValue = this.changeTracker.get(key);
// 			if (oldValue !== null && dependency.qualifier(dependency.value, oldValue)) {
// 				result += `${key}: ${dependency.value} `;
// 			}
// 		}
// 		console.log("result", result);
// 		return result.trim();
// 	}
// }

// Example usage:

// const initialDependencies = {
// 	dep1: "initial value 1",
// 	dep2: "initial value 2",
// };

// const qualifiers = {
// 	dep1: (newValue: string, oldValue: string | undefined) => newValue.length > oldValue!.length,
// 	dep2: (newValue: string, oldValue: string | undefined) => newValue !== oldValue,
// };

// const producer = new ConditionalStringProducer(initialDependencies, qualifiers);

// producer.updateDependency("dep1", "new longer value 1"); // Updates because the new value length is greater
// producer.updateDependency("dep2", "initial value 2"); // Does not update because the value is the same

// console.log(producer.produceString()); // Output: "dep1: new longer value 1"

export class APPSDepTrackerV1<T, V> {
	constructor(
		private prevValue: T,
		private readonly getValue: () => T,
		private readonly effect: () => V,
		private readonly qualifier?: (prevValue: T, newValue: T) => boolean,
	) {}

	public trigger(newVal: T) {
		console.log(`comparing ${this.prevValue} to ${newVal}`);
		if (this.qualifier && this.qualifier(this.prevValue, newVal)) {
			console.log("qualifier change is TRUE");
			this.effect();
			this.prevValue = newVal;
		} else {
			console.log("qualifier change is false");
		}
		if (this.qualifier === undefined && this.prevValue !== this.getValue()) {
			console.log("straight check change Triggered");
			this.effect();
			this.prevValue = newVal;
		}
	}
}

export type Dependency<T> = {
	getValue: () => T;
	qualifier?: (prevValue: T, newValue: T) => boolean;
};

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

// type useAppSerializerProps = {
// 	intervalMs: number;
// 	segments: MultiDepTracker<string>[];
// 	destinationCellHandle: IFluidHandle<ISharedCell>;
// };

// let appSerializer_global

// export function useAppSerializer(props: useAppSerializerProps) {
// 	const [appSerializer, setAppSerializer] = useState<AppSerializer>();

// 	useEffect(() => {
// 		if (props.segments.length > 0) {
// 			const initializeAppSerializer = async () => {
// 				if (appSerializer != undefined) {
// 					// we need to replace the existing serializer since the segments have changed.
// 					appSerializer.stop();
// 				}
// 				const sharedCell = await props.destinationCellHandle.get();
// 				setAppSerializer(new AppSerializer(props.segments, 5000, sharedCell));
// 			};

// 			initializeAppSerializer();
// 		}

// 		return () => {
// 			appSerializer?.stop();
// 		};
// 	}, [props.segments]);

// 	return [appSerializer];
// }
