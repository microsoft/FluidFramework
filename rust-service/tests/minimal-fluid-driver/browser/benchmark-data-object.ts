import { Tree } from "@fluidframework/tree";
import type { ITree } from "@fluidframework/tree/legacy";

import type { IBenchmarkSharedObject } from "./benchmark-shared-object.js";
import type {
	BenchmarkState,
	benchmarkTreeConfiguration,
} from "./shared-tree-benchmark-schema.js";
import { sharedTreeOperationForValue } from "../src/capturedSharedTreeOperation.js";

export type BenchmarkDataStructure = "dummy" | "shared-tree";

export interface BenchmarkDataObject {
	readonly appliedOpCount: number;
	readonly value: number;
	set(value: number): void;
	dispose(): void;
}

interface SharedTreeView {
	readonly root: BenchmarkState;
	dispose(): void;
}

export function parseBenchmarkDataStructure(value: string | null): BenchmarkDataStructure {
	if (value === null || value === "dummy") {
		return "dummy";
	}
	if (value === "shared-tree") {
		return value;
	}
	throw new Error(`unsupported data structure ${JSON.stringify(value)}`);
}

export function adaptDummy(object: IBenchmarkSharedObject): BenchmarkDataObject {
	let value = object.appliedOpCount;
	const listener = (count: number): void => {
		value = count;
	};
	object.on("opApplied", listener);
	return {
		get appliedOpCount() {
			return object.appliedOpCount;
		},
		get value() {
			return value;
		},
		set: (nextValue) => object.send(sharedTreeOperationForValue(nextValue)),
		dispose: () => object.off("opApplied", listener),
	};
}

export function adaptSharedTree(view: SharedTreeView): BenchmarkDataObject {
	let appliedOpCount = 0;
	const unsubscribe = Tree.on(view.root, "nodeChanged", () => appliedOpCount++);
	return {
		get appliedOpCount() {
			return appliedOpCount;
		},
		get value() {
			return view.root.value;
		},
		set: (value) => {
			view.root.value = value;
		},
		dispose: () => {
			unsubscribe();
			view.dispose();
		},
	};
}

export function adaptInitialObject(
	object: IBenchmarkSharedObject | ITree,
	dataStructure: BenchmarkDataStructure,
	initialize: boolean,
	configuration: typeof benchmarkTreeConfiguration,
): BenchmarkDataObject {
	if (dataStructure === "dummy") {
		return adaptDummy(object as IBenchmarkSharedObject);
	}
	const view = (object as ITree).viewWith(configuration);
	if (initialize) {
		view.initialize({ value: 0 });
	}
	return adaptSharedTree(view as unknown as SharedTreeView);
}
