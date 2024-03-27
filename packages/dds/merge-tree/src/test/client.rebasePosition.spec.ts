/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IMergeTreeOp } from "../ops.js";
import { TestClient } from "./testClient.js";

describe("client.rebasePosition", () => {
	const localUserLongId = "localUser";
	const remoteUserLongId = "remoteUser";
	let client: TestClient;
	let seq: number;

	const getTextAt = (pos: number): string => client.getText(pos, pos + 1);

	beforeEach(() => {
		client = new TestClient();
		client.insertTextLocal(0, "hello world");
		client.startOrUpdateCollaboration(localUserLongId);
		seq = 0;
	});

	it("rebase past remote insert", () => {
		client.insertTextRemote(0, "abc", undefined, ++seq, 0, remoteUserLongId);
		const rebasedPos = client.rebasePosition(6 /* "w" */, 0, 0);
		const text = getTextAt(rebasedPos);
		assert.equal(text, "w", "rebased pos should still refer to 'w'");
	});

	it("rebase past remote delete", () => {
		client.removeRangeRemote(0, 3, ++seq, 0, remoteUserLongId);
		const rebasedPos = client.rebasePosition(6 /* w */, 0, 0);
		const text = getTextAt(rebasedPos);
		assert.equal(text, "w", "rebased pos should still refer to 'w'");
	});

	it("rebase on a variety of seqNumberFrom values", () => {
		client.insertTextRemote(0, "abc", undefined, ++seq, 0, remoteUserLongId);
		client.removeRangeRemote(0, 1, ++seq, seq - 1, remoteUserLongId);
		client.insertTextRemote(1, "XYZ@", undefined, ++seq, seq - 1, remoteUserLongId);

		const rebasedPos0 = client.rebasePosition(6 /* into "hello world" */, 0, 0);
		const rebasedPos1 = client.rebasePosition(6 /* into "abchello world" */, 1, 0);
		const rebasedPos2 = client.rebasePosition(6 /* into "bchello world" */, 2, 0);
		const rebasedPos3 = client.rebasePosition(6 /* into "bXYZ@chello world" */, 3, 0);

		assert.equal(getTextAt(rebasedPos0), "w");
		assert.equal(getTextAt(rebasedPos1), "l");
		assert.equal(getTextAt(rebasedPos2), "o");
		assert.equal(getTextAt(rebasedPos3), "h");
	});

	describe("with subsequent local changes", () => {
		// Rebasing is made more complicated from the client perspective when there are local changes applied
		// meanwhile, since the local state of the string contains segments that should not be considered
		// when computing the position to rebase to (since they wouldn't be visible remotely)

		let op1: IMergeTreeOp | undefined;
		let op2: IMergeTreeOp | undefined;
		beforeEach(() => {
			op1 = client.insertTextLocal(5, "123456");
			op2 = client.removeRangeLocal(3, 5);
		});

		// For these tests, rebasedPos conceptually refers to a position that a *remote* client should use in order
		// to get an equivalent position to the one that was applied locally with a different refSeq.
		// Since this suite doesn't actually spin up a remote client, we verify this equivalence by asking
		// the local client to resolve that remote position and confirm the text matches what's expected.
		const expectTextAtRebasedPosMatches = (pos: number, expected: string, message?: string) => {
			const localViewOfRebasedPos = client.resolveRemoteClientPosition(
				pos,
				seq,
				remoteUserLongId,
			);
			assert(localViewOfRebasedPos !== undefined, "pos should be defined");
			const text = getTextAt(localViewOfRebasedPos);
			assert.equal(text, expected, message);
		};

		it("rebase past remote insert", () => {
			client.insertTextRemote(0, "abc", undefined, ++seq, 0, remoteUserLongId);
			const rebasedPos = client.rebasePosition(6 /* index 6 into "hello world" */, 0, 0);
			const rebasedPos1 = client.rebasePosition(
				6 /* index 6 into "hello123456 world" */,
				0,
				1,
			);
			const rebasedPos2 = client.rebasePosition(6 /* index 6 into "hel123456 world" */, 0, 2);

			expectTextAtRebasedPosMatches(rebasedPos, "w");

			client.applyMsg(client.makeOpMessage(op1, ++seq, 0, localUserLongId), true);
			expectTextAtRebasedPosMatches(rebasedPos1, "2");

			client.applyMsg(client.makeOpMessage(op2, ++seq, 0, localUserLongId), true);
			expectTextAtRebasedPosMatches(rebasedPos2, "4");
		});

		it("rebase past remote delete", () => {
			client.removeRangeRemote(0, 2, ++seq, 0, remoteUserLongId);
			const rebasedPos = client.rebasePosition(6 /* index 6 into "hello world" */, 0, 0);
			const rebasedPos1 = client.rebasePosition(
				6 /* index 6 into "hello123456 world" */,
				0,
				1,
			);
			const rebasedPos2 = client.rebasePosition(6 /* index 6 into "hel123456 world" */, 0, 2);

			expectTextAtRebasedPosMatches(rebasedPos, "w");

			client.applyMsg(client.makeOpMessage(op1, ++seq, 0, localUserLongId), true);
			expectTextAtRebasedPosMatches(rebasedPos1, "2");

			client.applyMsg(client.makeOpMessage(op2, ++seq, 0, localUserLongId), true);
			expectTextAtRebasedPosMatches(rebasedPos2, "4");
		});

		// Mid-remote delete with meanwhile local edits isn't particularly more interesting than the cases
		// handled above. Instead we include some rebased positions amid the local delete (removal of "lo")
		// as this caught a bug with the original implementation.
		it("rebase mid local delete", () => {
			client.removeRangeRemote(0, 2, ++seq, 0, remoteUserLongId);
			const rebasedPos = client.rebasePosition(4 /* index 4 into "hello world" */, 0, 0);
			const rebasedPos1 = client.rebasePosition(
				4 /* index 4 into "hello123456 world" */,
				0,
				1,
			);
			const rebasedPos2 = client.rebasePosition(4 /* index 4 into "hel123456 world" */, 0, 2);

			assert.equal(rebasedPos, 2);
			assert.equal(rebasedPos1, 2);
			assert.equal(rebasedPos2, 2);
		});
	});
});
