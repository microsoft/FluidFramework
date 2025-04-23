/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type AnnouncedVisitor,
	type DeltaVisitor,
	type FieldKey,
	combineVisitors,
} from "../../core/index.js";
import { brand } from "../../util/index.js";

class LoggingVisitor implements DeltaVisitor {
	public readonly name: string;
	public readonly callLog: string[];
	public constructor(name: string, callLog: string[] = []) {
		this.name = name;
		this.callLog = callLog;
	}
	protected log(message: string): void {
		this.callLog.push(`${this.name}: ${message}`);
	}
	public free(): void {
		this.log("free");
	}
	public create(): void {
		this.log("create");
	}
	public destroy(): void {
		this.log("destroy");
	}
	public attach(): void {
		this.log("attach");
	}
	public detach(): void {
		this.log("detach");
	}
	public replace(): void {
		this.log("replace");
	}
	public enterNode(): void {
		this.log("enterNode");
	}
	public exitNode(): void {
		this.log("exitNode");
	}
	public enterField(): void {
		this.log("enterField");
	}
	public exitField(): void {
		this.log("exitField");
	}
}

class LoggingAnnouncedVisitor extends LoggingVisitor implements AnnouncedVisitor {
	public readonly type = "Announced";
	public afterCreate(): void {
		this.log("afterCreate");
	}
	public beforeDestroy(): void {
		this.log("beforeDestroy");
	}
	public beforeAttach(): void {
		this.log("beforeAttach");
	}
	public afterAttach(): void {
		this.log("afterAttach");
	}
	public beforeDetach(): void {
		this.log("beforeDetach");
	}
	public afterDetach(): void {
		this.log("afterDetach");
	}
	public beforeReplace(): void {
		this.log("beforeReplace");
	}
	public afterReplace(): void {
		this.log("afterReplace");
	}
}

const fieldKey: FieldKey = brand("field");

describe("combineVisitors", () => {
	it("calls all visitors in order", () => {
		const actual: string[] = [];
		const combined = combineVisitors([
			new LoggingVisitor("1", actual),
			new LoggingAnnouncedVisitor("2", actual),
			new LoggingVisitor("3", actual),
		]);
		combined.free();
		const expected = ["1: free", "2: free", "3: free"];
		assert.deepEqual(actual, expected);
	});
	it(`calls announced visitors "before" methods before visitor methods`, () => {
		const actual: string[] = [];
		const combined = combineVisitors([
			new LoggingVisitor("v1", actual),
			new LoggingAnnouncedVisitor("av1", actual),
			new LoggingVisitor("v2", actual),
			new LoggingAnnouncedVisitor("av2", actual),
		]);
		combined.destroy(fieldKey, 1);
		const expected = [
			"av1: beforeDestroy",
			"av2: beforeDestroy",
			"v1: destroy",
			"av1: destroy",
			"v2: destroy",
			"av2: destroy",
		];
		assert.deepEqual(actual, expected);
	});
	it(`calls announced visitors "after" methods after visitor methods`, () => {
		const actual: string[] = [];
		const combined = combineVisitors([
			new LoggingVisitor("v1", actual),
			new LoggingAnnouncedVisitor("av1", actual),
			new LoggingVisitor("v2", actual),
			new LoggingAnnouncedVisitor("av2", actual),
		]);
		combined.create([], fieldKey);
		const expected = [
			"v1: create",
			"av1: create",
			"v2: create",
			"av2: create",
			"av1: afterCreate",
			"av2: afterCreate",
		];
		assert.deepEqual(actual, expected);
	});
	it("combines CombinedVisitor instances in a way that preserves before/after ordering", () => {
		const actual: string[] = [];
		const combined = combineVisitors([
			combineVisitors([new LoggingAnnouncedVisitor("av1", actual)]),
			new LoggingVisitor("v", actual),
			combineVisitors([new LoggingAnnouncedVisitor("av2", actual)]),
		]);
		combined.detach({ start: 0, end: 1 }, fieldKey, { minor: 42 });
		actual.push("---");
		combined.attach(fieldKey, 1, 42);
		const expected = [
			"av1: beforeDetach",
			"av2: beforeDetach",
			"av1: detach",
			"v: detach",
			"av2: detach",
			"av1: afterDetach",
			"av2: afterDetach",
			"---",
			"av1: beforeAttach",
			"av2: beforeAttach",
			"av1: attach",
			"v: attach",
			"av2: attach",
			"av1: afterAttach",
			"av2: afterAttach",
		];
		assert.deepEqual(actual, expected);
	});
});
