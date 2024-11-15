/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	ChangeFamily,
	ChangeFamilyEditor,
	TaggedChange,
	ChangeEncodingContext,
	RevisionTag,
} from "../../core/index.js";
import { makeMitigatedChangeFamily } from "../../feature-libraries/index.js";
import type { ICodecFamily } from "../../codec/index.js";
import { mintRevisionTag } from "../utils.js";

const fallback = "Fallback";

// TODO: use something other than any for the mocking patterns here
/* eslint-disable @typescript-eslint/no-explicit-any */
const arg1: any = "arg1";
const arg2: any = "arg2";
const arg3: any = "arg3";
/* eslint-enable @typescript-eslint/no-explicit-any */

const throwingFamily: ChangeFamily<ChangeFamilyEditor, string> = {
	buildEditor: (
		mintRevisionTagThrow: () => RevisionTag,
		changeReceiver: (change: TaggedChange<string>) => void,
	): ChangeFamilyEditor => {
		assert.equal(changeReceiver, arg1);
		throw new Error("buildEditor");
	},
	rebaser: {
		compose: (changes: TaggedChange<string>[]): string => {
			assert.equal(changes, arg1);
			throw new Error("compose");
		},
		invert: (change: TaggedChange<string>, isRollback: boolean): string => {
			assert.equal(change, arg1);
			assert.equal(isRollback, arg2);
			throw new Error("invert");
		},
		rebase: (change: TaggedChange<string>, over: TaggedChange<string>): string => {
			assert.equal(change, arg1);
			assert.equal(over, arg2);
			throw new Error("rebase");
		},
		changeRevision: (): string => {
			throw new Error("changeRevision");
		},
	},
	codecs: {} as unknown as ICodecFamily<string, ChangeEncodingContext>,
};
const returningFamily: ChangeFamily<ChangeFamilyEditor, string> = {
	buildEditor: (
		mintRevisionTagRet: () => RevisionTag,
		changeReceiver: (change: TaggedChange<string>) => void,
	): ChangeFamilyEditor => {
		assert.equal(changeReceiver, arg1);
		return "buildEditor" as unknown as ChangeFamilyEditor;
	},
	rebaser: {
		compose: (changes: TaggedChange<string>[]): string => {
			assert.equal(changes, arg1);
			return "compose";
		},
		invert: (change: TaggedChange<string>, isRollback: boolean): string => {
			assert.equal(change, arg1);
			assert.equal(isRollback, arg2);
			return "invert";
		},
		rebase: (change: TaggedChange<string>, over: TaggedChange<string>): string => {
			assert.equal(change, arg1);
			assert.equal(over, arg2);
			return "rebase";
		},
		changeRevision: (change: string): string => change,
	},
	codecs: {} as unknown as ICodecFamily<string, ChangeEncodingContext>,
};

const errorLog: unknown[] = [];
const mitigatedThrowingFamily = makeMitigatedChangeFamily(throwingFamily, fallback, (error) =>
	errorLog.push((error as Error).message),
);
const mitigatedReturningFamily = makeMitigatedChangeFamily(returningFamily, fallback, () =>
	assert.fail("Unexpected onError call"),
);
const mitigatedReturningRebaser = mitigatedReturningFamily.rebaser;
const mitigatedThrowingRebaser = mitigatedThrowingFamily.rebaser;
const returningRebaser = returningFamily.rebaser;

describe("makeMitigatedChangeFamily", () => {
	it("does not interfere so long as nothing is thrown", () => {
		assert.equal(
			mitigatedReturningFamily.buildEditor(mintRevisionTag, arg1),
			returningFamily.buildEditor(mintRevisionTag, arg1),
		);
		assert.equal(
			mitigatedReturningRebaser.rebase(arg1, arg2, arg3),
			returningRebaser.rebase(arg1, arg2, arg3),
		);
		const revision = mintRevisionTag();
		assert.equal(
			mitigatedReturningRebaser.invert(arg1, arg2, revision),
			returningRebaser.invert(arg1, arg2, revision),
		);
		assert.equal(mitigatedReturningRebaser.compose(arg1), returningRebaser.compose(arg1));
	});
	describe("catches errors from", () => {
		it("rebase", () => {
			errorLog.length = 0;
			assert.equal(mitigatedThrowingRebaser.rebase(arg1, arg2, arg3), fallback);
			assert.deepEqual(errorLog, ["rebase"]);
		});
		it("invert", () => {
			errorLog.length = 0;
			assert.equal(mitigatedThrowingRebaser.invert(arg1, arg2, mintRevisionTag()), fallback);
			assert.deepEqual(errorLog, ["invert"]);
		});
		it("compose", () => {
			errorLog.length = 0;
			assert.equal(mitigatedThrowingRebaser.compose(arg1), fallback);
			assert.deepEqual(errorLog, ["compose"]);
		});
	});
	it("does not catch errors from buildEditor", () => {
		errorLog.length = 0;
		assert.throws(
			() => mitigatedThrowingFamily.buildEditor(mintRevisionTag, arg1),
			new Error("buildEditor"),
		);
		assert.deepEqual(errorLog, []);
	});
	it("does affect codecs", () => {
		assert.equal(mitigatedReturningFamily.codecs, returningFamily.codecs);
	});
});
