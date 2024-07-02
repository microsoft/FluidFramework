import {
	// SharedCounter,
	type ISharedCounter,
} from "@fluidframework/counter/internal";
import {
	type ISharedString,
	//  type SharedString
} from "@fluidframework/sequence/internal";
// import type { ISharedObjectKind } from "../../../../../packages/dds/shared-object-base/lib/sharedObject.js";

// class DependencyTracker {
// 	private dependencies: unknown[];
// 	private previousDependencies: unknown[];

// 	constructor(dependencies: unknown[], trigger: () => boolean) {
// 		this.dependencies = dependencies;
// 		this.previousDependencies = [];
// 	}

// 	setDependencies(dependencies: unknown[]): void {
// 		this.previousDependencies = [...this.dependencies];
// 		this.dependencies = dependencies;
// 	}

// 	hasChanged(): boolean {
// 		if (this.dependencies.length !== this.previousDependencies.length) {
// 			return true;
// 		}
// 		for (let i = 0; i < this.dependencies.length; i++) {
// 			if (this.dependencies[i] !== this.previousDependencies[i]) {
// 				return true;
// 			}
// 		}
// 		return false;
// 	}

// 	triggerChangeCheck() {
// 		const hasChanged = this.hasChanged();
// 		console.log("change is triggered: ", hasChanged);
// 		return hasChanged;
// 	}
// }

// export type SerializableDDS = SharedCounter | SharedString;

// export class ddsAppSerializer {
// 	constructor(
// 		private readonly serializerFn: () => string,
// 		dependencies: {
// 			counters: {
// 				dds: ISharedCounter;
// 				qualifier?: (prevVal: number) => boolean;
// 			}[];
// 			globalQualifier?: () => boolean;
// 		},
// 	) {
// 		dependencies.counters.forEach((counter) => {
// 			counter.dds.on("incremented", () => {
// 				this.serializerAppFromDep(dependencies.globalQualifier, counter.qualifier);
// 			});
// 		});
// 	}

// 	private serializerAppFromDep(
// 		globalQualifier: (() => boolean) | undefined,
// 		qualifier: ((prevVal) => boolean) | undefined,
// 	) {
// 		if (globalQualifier && globalQualifier()) {
// 			this.serializerFn();
// 		} else if (qualifier && qualifier()) {
// 			this.serializerFn();
// 		}

// 		if (globalQualifier === undefined && qualifier === undefined) {
// 			this.serializerFn();
// 		}
// 	}
// }

export class CounterTracker {
	private previousValue: number;
	private readonly counter: ISharedCounter;

	constructor(counter: ISharedCounter) {
		console.log("a new counter tracker was created");
		this.counter = counter;
		this.previousValue = counter.value;

		counter.on("incremented", (incrementAmount, newValue) => {
			console.log("counter increment called with new value", newValue);
			const shouldTrigger = this.shouldTriggerChange(this.previousValue, newValue);
			if (shouldTrigger) {
				this.previousValue = newValue;
				console.log(this.serialize());
			}
		});
	}

	public shouldTriggerChange(previousValue: number, newValue: number): boolean {
		console.log("shouldTriggerChange called with prev and new values", previousValue, newValue);
		if (Math.abs(previousValue - newValue) >= 2) {
			console.log("a counter change of > 2 observed");
			return true;
		}
		return false;
	}

	public serialize(): string {
		console.log("Serializing App...");
		return `Total number of happy employees: ${this.counter.value}`;
	}
}

export class StringTracker {
	// private previousValue: string;
	// private readonly sharedString: ISharedString;

	constructor(sharedString: ISharedString) {
		console.log("a new shared string tracker was created");
		// this.sharedString = sharedString;
		// this.previousValue = sharedString.getText();

		sharedString.on("createIntervalCollection", (text) => {
			console.log("A Shared String change was observed:", text);
		});
	}
}
