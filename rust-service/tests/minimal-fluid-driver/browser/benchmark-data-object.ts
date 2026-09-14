import { Tree } from "@fluidframework/tree";
import type { ITree } from "@fluidframework/tree/legacy";

import type { IBenchmarkSharedObject } from "./benchmark-shared-object.js";
import type {
	BenchmarkState,
	benchmarkTreeConfiguration,
} from "./shared-tree-benchmark-schema.js";
import { sharedTreeOperationForValue } from "../src/capturedSharedTreeOperation.js";

/** Data structure implementation selected for a benchmark run. */
export type BenchmarkDataStructure = "dummy" | "shared-tree";

/** Common observable and mutation surface used by every benchmark DDS. */
export interface BenchmarkDataObject {
	/** Number of operations applied since this adapter was created. */
	readonly appliedOpCount: number;
	/** Current scalar value exposed by the selected DDS. */
	readonly value: number;
	/** Submits an edit that replaces the scalar value. */
	set(value: number): void;
	/** Releases listeners and views owned by the adapter. */
	dispose(): void;
}

/** Minimal SharedTree view surface needed by the benchmark adapter. */
interface SharedTreeView {
	/** Root object containing the benchmark's scalar state. */
	readonly root: BenchmarkState;
	/** Releases the underlying tree view. */
	dispose(): void;
}

/** Parses and validates the DDS selector from the browser query string. */
export function parseBenchmarkDataStructure(value: string | null): BenchmarkDataStructure {
	if (value === null || value === "dummy") {
		return "dummy";
	}
	if (value === "shared-tree") {
		return value;
	}
	throw new Error(`unsupported data structure ${JSON.stringify(value)}`);
}

/** Adapts the captured-payload SharedObject to the common benchmark surface. */
export function adaptDummy(object: IBenchmarkSharedObject): BenchmarkDataObject {
	let value = object.appliedOpCount;
	const listener = (count: number): void => {
		value = count;
	};
	object.on("opApplied", listener);
	return {
		/** Number of operations applied by the wrapped benchmark SharedObject. */
		get appliedOpCount() {
			return object.appliedOpCount;
		},
		/** Latest count observed from the wrapped benchmark SharedObject. */
		get value() {
			return value;
		},
		set: (nextValue) => object.send(sharedTreeOperationForValue(nextValue)),
		dispose: () => object.off("opApplied", listener),
	};
}

/** Adapts a SharedTree scalar view to the common benchmark surface. */
export function adaptSharedTree(view: SharedTreeView): BenchmarkDataObject {
	let appliedOpCount = 0;
	const unsubscribe = Tree.on(view.root, "nodeChanged", () => appliedOpCount++);
	return {
		/** Number of SharedTree changes observed by this adapter. */
		get appliedOpCount() {
			return appliedOpCount;
		},
		/** Current scalar stored at the benchmark tree root. */
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

/** Adapts and, when requested, initializes a container's benchmark object. */
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
