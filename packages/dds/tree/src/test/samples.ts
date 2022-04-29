/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Commutativity, Original, Rebased, Sibling, Sequenced as S, Squashed as Sq, Tiebreak } from "../format";

export namespace SwapCousins {
	// Swap the first nodes of traits foo and bar using set-like ranges
	export const e1: Original.ChangeFrame = {
		moves: [
			{ src: { foo: 0 }, dst: { bar: 0 } },
			{ src: { bar: 0 }, dst: { foo: 0 } },
		],
		marks: [{
			modify: {
				foo: [
					{ type: "MoveOut", op: 0 },
					{ type: "MoveInSet", op: 1 },
				],
				bar: [
					{ type: "MoveInSet", op: 0 },
					{ type: "MoveOut", op: 1 },
				],
			},
		}],
	};
}

export namespace SwapParentChild {
	// Swap parent/child:
	// From: R{ foo: B{ bar: C{ baz: D } } }
	// To:   R{ foo: C{ bar: B{ baz: D } } }
	export const e1: Original.ChangeFrame = {
		moves: [
			{ src: { foo: 0 }, dst: { foo: { 0: { bar: 0 } } } }, // B
			{ src: { foo: { 0: { bar: 0 } } }, dst: { foo: 0 } }, // C
			{ src: { foo: { 0: { bar: { 0: { baz: 0 } } } } }, dst: { foo: { 0: { bar: { 0: { baz: 0 } } } } } }, // D
		],
		marks: [{
			modify: {
				foo: [
					{
						type: "MoveOut", // B,
						op: 0,
						mods: [{ // Modify B
							modify: {
								bar: [
									{
										type: "MoveOut", // C
										op: 1,
										mods: [{ // Modify C
											modify: {
												baz: [
													{
														type: "MoveOut", // D
														op: 2,
													},
												],
											},
										}],
									},
								],
							},
						}],
					},
					{
						type: "MoveInSet", // C
						op: 1,
						mods: [{ // Modify C
							modify: {
								bar: [
									{
										type: "MoveInSet", // B
										op: 0,
										mods: [{ // Modify B
											modify: {
												baz: [
													{
														type: "MoveInSet", // D
														op: 2,
													},
												],
											},
										}],
									},
								],
							},
						}],
					},
				],
			},
		}],
	};
}

export namespace ScenarioA1 {
	/**
	Scenario A
	In a trait foo that contains the nodes [A B C D], three users concurrently attempt the following operations (ordered
	here from first sequenced to last sequenced):
	  User 1: delete B C
	  User 2: move slice-like range B C D to some other trait bar
	  User 3: insert X after B (commutative)

	X should end up in trait bar. In order for that to be possible, we need to preserve
	the fact that the move operation performed by user 2 was targeted not only at node D but also at nodes B and C. We
	also need to preserve the fact that the insertion of X was made with respect to B. This is challenging because the
	third edit will be rebased over the deletion of B C. This last point also holds for insertions of detached content
	(i.e., `MoveIn*`)

	Takeaways:
	We need to preserve the layering of moves over deletions.
	We need to know which move operations apply to which nodes, even when they are deleted.
	We need to know which node a given insertion or move-in was relative to.
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "Delete", length: 2 },
					],
				},
			}],
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			moves: [{ src: { foo: 1 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "MoveOutStart", side: Sibling.Next, op: 0 },
						3, // Skip B C D
						{ type: "End", op: 0 },
					],
					bar: [
						{ type: "MoveInSlice", op: 0, length: 3 },
					],
				},
			}],
		}],
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: [{
				modify: {
					foo: [
						2, // Skip A B
						{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.Full },
					],
				},
			}],
		}],
	};

	export const e2p: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		frames: [{
			moves: [{ src: { foo: 1 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "MoveOutStart", side: Sibling.Next, op: 0 },
						{ type: "PriorDetach", seq: 1, length: 2 }, // Delete B C
						1, // Skip D
						{ type: "End", op: 0 },
					],
					bar: [
						{ type: "MoveInSlice", op: 0, length: 3 },
					],
				},
			}],
		}],
	};

	export const e3_r_e1: Rebased.Modify = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "PriorDetach", seq: 1 }, // Delete of B
				{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.Full },
				{ type: "PriorDetach", seq: 1 }, // Delete of C
			],
		},
	};

	export const e3re1_r_e2re1: Rebased.Modify = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "PriorDetach", seq: 1, length: 2 }, // Delete of B C (from e1)
				{ type: "PriorDetach", seq: 2 }, // MoveOut D (from e2)
			],
			bar: [
				{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.Full },
			],
		},
	};

	export const originals = [e1, e2, e3];
}

export namespace ScenarioA2 {
	/**
	Scenario A2 (same as A but with the slice starting at C)
	In a trait foo that contains the nodes [A B C D], three users concurrently attempt the following operations (ordered
	here from first sequenced to last sequenced):
	  User 1: delete B C
	  User 2: move slice-like range C D to some other trait bar
	  User 3: insert X after C (commutative)

	X should end up in trait bar. In order for that to be possible, we need to preserve
	the fact that the move operation performed by user 2 was targeted not only at node D but also at nodes B and C. We
	also need to preserve the fact that the insertion of X was made with respect to B. This is challenging because the
	third edit will be rebased over the deletion of B C. This last point also holds for insertions of detached content
	(i.e., `MoveIn*`)

	Takeaways:
	We need to preserve the layering of moves over deletions.
	We need to know which move operations apply to which nodes, even when they are deleted.
	We need to know which node a given insertion or move-in was relative to.
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "Delete", length: 2 },
					],
				},
			}],
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			moves: [{ src: { foo: 2 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						2, // Skip A B
						{ type: "MoveOutStart", side: Sibling.Next, op: 0 },
						2, // Skip C D
						{ type: "End", op: 0 },
					],
					bar: [
						{ type: "MoveInSlice", op: 0, length: 2 },
					],
				},
			}],
		}],
	};

	export const e3: Original.Modify = {
		modify: {
			foo: [
				3, // Skip A B C
				{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.MoveOnly },
			],
		},
	};

	export const e2p: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		frames: [{
			moves: [{ src: { foo: 2 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "PriorDetach", seq: 1 }, // B
						{ type: "MoveOutStart", side: Sibling.Next, op: 0 },
						{ type: "PriorDetach", seq: 1 }, // C
						1, // Skip D
						{ type: "End", op: 0 },
					],
					bar: [
						{ type: "MoveInSlice", op: 0, length: 2 },
					],
				},
			}],
		}],
	};

	export const e3_r_e1: Rebased.Modify = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "PriorDetach", seq: 1, length: 2 }, // B C
				{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.MoveOnly },
			],
		},
	};

	export const e3re1_r_e2re1: Rebased.Modify = {
		modify: {
			foo: [
				1, // Skip A
				{ type: "PriorDetach", seq: 1, length: 2 }, // B C
				{ type: "PriorDetach", seq: 2 }, // D
			],
			bar: [
				{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.MoveOnly },
			],
		},
	};
}

export namespace ScenarioC {
	/*
	Scenario C
	  User 1: insert B after A
	  User 1: move B to some other trait bar
	  User 2: insert X after B (never move) <- done with knowledge of edit #1

	X should be inserted to into the foo trait (as opposed to following B into the bar trait).

	Takeaways:
	We need to preserve the layering of moves over insertions.
	It is not sufficient to represent insertions of content that is subsequently moved as insertions in their final
	location.
	Note: this scenario motivates this being is true across commits but not within commits.
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "Insert", content: [{ id: "B" }] },
					],
				},
			}],
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			moves: [{ src: { foo: 1 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "MoveOut", op: 0 },
					],
					bar: [
						{ type: "MoveInSet", op: 0 },
					],
				},
			}],
		}],
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: [{
				modify: {
					foo: [
						2, // Skip A B
						{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.None },
					],
				},
			}],
		}],
	};

	export const e3p: S.Transaction = {
		seq: 3,
		ref: 0,
		newRef: 2,
		frames: [{
			priorMoves: { 2: [{ src: { foo: 1 }, dst: { bar: 0 } }] },
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "PriorDetach", seq: 2 }, // B
						{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.None },
					],
				},
			}],
		}],
	};
}

export namespace ScenarioD {
	/*
	Scenario D
	In trait foo [A B C]:
	  User 1: move slice range [B_] to some other trait bar
	  User 2:
	    insert X after B (with commutative move semantics)
	    move slice-like range [A B X C] to some other trait baz

	X should be inserted to into the baz trait (as opposed to ending up in the bar trait).
	The commutativity of the insertion of X could still be leveraged if user 1 moved content from trait baz
	*/

	export const e1: S.Transaction = {
		seq: 1,
		ref: 0,
		frames: [{
			moves: [{ src: { foo: 1 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "MoveOutStart", op: 0 },
						1, // Skip B
						{ type: "End", side: Sibling.Next, op: 0 },
					],
					bar: [
						{ type: "MoveInSlice", op: 0 },
					],
				},
			}],
		}],
	};

	export const e2: S.Transaction = {
		seq: 2,
		ref: 0,
		frames: [{
			moves: [
				{ src: { foo: 0 }, dst: { baz: 0 } },
				{ src: { foo: 2 }, dst: { baz: 3 } },
			],
			marks: [{
				modify: {
					foo: [
						{ type: "MoveOutStart", op: 0 },
						2, // A B
						{
							type: "End",
							op: 0,
							side: Sibling.Next,
							tiebreak: Tiebreak.FirstToLast,
						},
						{
							type: "MoveOutStart",
							op: 1,
							side: Sibling.Prev,
							tiebreak: Tiebreak.LastToFirst,
						},
						1, // C
						{ type: "End", op: 1 },
					],
					baz: [
						{ type: "MoveInSlice", op: 0, length: 2 }, // A B
						{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.MoveOnly },
						{ type: "MoveInSlice", op: 1 }, // C
					],
				},
			}],
		}],
	};

	export const e2p: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		frames: [{
			moves: [
				{ src: { foo: 0 }, dst: { baz: 0 } },
				{ src: { foo: 2 }, dst: { baz: 3 } },
			],
			priorMoves: { 1: [{ src: { foo: 1 }, dst: { bar: 0 } }] },
			marks: [{
				modify: {
					foo: [
						{ type: "MoveOutStart", op: 0 },
						1, // A
						{ type: "PriorMoveOutStart", seq: 1, op: 0 },
						1, // B
						{ type: "PriorSliceEnd", seq: 1, op: 0 },
						{
							type: "End",
							op: 0,
							side: Sibling.Next,
							tiebreak: Tiebreak.FirstToLast,
						},
						{
							type: "MoveOutStart",
							op: 1,
							side: Sibling.Prev,
							tiebreak: Tiebreak.LastToFirst,
						},
						1, // C
						{ type: "End", op: 1 },
					],
					baz: [
						{ type: "MoveInSlice", op: 0, length: 2 }, // A
						{ type: "Insert", content: [{ id: "X" }], commute: Commutativity.MoveOnly },
						{ type: "MoveInSlice", op: 1 }, // C
					],
				},
			}],
		}],
	};
}

export namespace ScenarioE {
	/*
	In trait foo [A B C]:
	  User 1: move slice [B_] to some other trait bar
	  User 2 in one commit:
	    insert X after B (with commutative-move semantics)
	    delete slice-like range [A B X C]

	B should be deleted (as opposed to inserted in trait bar).
	*/

	export const e1: S.Transaction = {
		seq: 1,
		ref: 0,
		frames: [{
			moves: [{ src: { foo: 1 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "MoveOutStart", op: 0 },
						1, // Skip B
						{ type: "End", side: Sibling.Next, op: 0 },
					],
					bar: [
						{ type: "MoveInSlice", op: 0 }, // B
					],
				},
			}],
		}],
	};

	export const e2: S.Transaction = {
		seq: 2,
		ref: 0,
		frames: [{
			marks: [{
				modify: {
					foo: [
						{ type: "DeleteStart", op: 0 },
						3, // Skip A B C
						{ type: "End", op: 0 },
					],
				},
			}],
		}],
	};

	export const e2p: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		frames: [{
			priorMoves: { 1: [{ src: { foo: 1 }, dst: { bar: 0 } }] },
			marks: [{
				modify: {
					foo: [
						{ type: "DeleteStart", op: 0 },
						1, // Skip A
						{ type: "PriorMoveOutStart", seq: 1, op: 0 },
						1, // Skip B
						{ type: "PriorSliceEnd", seq: 1, op: 0 },
						1, // Skip C
						{ type: "End", op: 0 },
					],
				},
			}],
		}],
	};
}

export namespace ScenarioF {
	/*
	starting state: 'AB' (known to both client 1 and client 2)
	  Edit #1 by client 1: insert 'r' at index 0 (local state: 'rAB')
	  Edit #2 by client 2: insert 'xz' at index 1 (local state: 'AxzB')
	  Edit #3 by client 2: insert 'y' at index 2 (local state: 'AxyzB')

	Expected outcome: 'rAxyzB'
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			marks: [{
				modify: {
					foo: [
						{ type: "Insert", content: [{ id: "r" }] },
					],
				},
			}],
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "Insert", content: [{ id: "x" }, { id: "z" }] },
					],
				},
			}],
		}],
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: [{
				modify: {
					foo: [
						2, // Skip A x
						{ type: "Insert", content: [{ id: "y" }] },
					],
				},
			}],
		}],
	};

	export const e2neg: Sq.ChangeFrame = {
		ref: 0,
		minSeq: -2,
		maxSeq: -2,
		marks: [{
			modify: {
				foo: [
					1, // Skip A
					{ type: "Delete", length: 2 },
				],
			},
		}],
	};

	export const e2pos: Sq.ChangeFrame = {
		ref: 0,
		minSeq: 2,
		maxSeq: 2,
		marks: [{
			modify: {
				foo: [
					1, // Skip A
					{ type: "Insert", content: [{ id: "x" }, { id: "z" }] },
				],
			},
		}],
	};

	export const e2posp: Sq.ChangeFrame = {
		ref: 0,
		minSeq: 2,
		maxSeq: 2,
		marks: [{
			modify: {
				foo: [
					2, // Skip r A
					{ type: "Insert", content: [{ id: "x" }, { id: "z" }] },
				],
			},
		}],
	};

	export const e3d: Sq.ChangeFrame = {
		ref: 0,
		minSeq: -2,
		maxSeq: 2,
		marks: [{
			modify: {
				foo: [
					{ type: "Insert", content: [{ id: "r" }] },
				],
			},
		}],
	};

	export const e2p: S.Transaction = {
		ref: 0,
		newRef: 1,
		seq: 2,
		frames: [{
			marks: [{
				modify: {
					foo: [
						2, // Skip r A
						{ type: "Insert", content: [{ id: "x" }, { id: "z" }] },
					],
				},
			}],
		}],
	};

	export const e3p: Rebased.Modify = {
		modify: {
			foo: [
				3, // Skip r, A, x
				{ type: "Insert", content: [{ id: "y" }] },
			],
		},
	};

	export const originals = [e1, e2, e3];
}

export namespace ScenarioG {
	/*
	In trait foo [A B]:
	  User 1: move slice [A B] to some other trait bar
	  User 2: insert [X Y] after A (with commutative-move semantics)
	  User 2: insert N after X (with never-move semantics)
	  User 2: insert M before X (with never-move semantics)
	  User 2: insert O after Y (with never-move semantics)

	X Y should be inserted to into the bar trait.
	M N O  should be inserted to into the foo trait (in that order).
	*/

	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		frames: [{
			moves: [{ src: { foo: 0 }, dst: { bar: 0 } }],
			marks: [{
				modify: {
					foo: [
						{ type: "MoveOutStart", op: 0 },
						2, // Skip A B
						{ type: "End", side: Sibling.Next, op: 0 },
					],
					bar: [
						{ type: "MoveInSlice", op: 0, length: 2 },
					],
				},
			}],
		}],
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		frames: [{
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "Insert", content: [{ id: "X" }, { id: "Y" }], commute: Commutativity.Full },
					],
				},
			}],
		}],
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		frames: [{
			marks: [{
				modify: {
					foo: [
						2, // Skip A X
						{ type: "Insert", content: [{ id: "N" }], commute: Commutativity.None },
					],
				},
			}],
		}],
	};

	export const e4: S.Transaction = {
		ref: 0,
		seq: 4,
		frames: [{
			marks: [{
				modify: {
					foo: [
						1, // Skip A
						{ type: "Insert", content: [{ id: "M" }], side: Sibling.Next, commute: Commutativity.None },
					],
				},
			}],
		}],
	};

	export const e5: S.Transaction = {
		ref: 0,
		seq: 5,
		frames: [{
			marks: [{
				modify: {
					foo: [
						5, // Skip A X M N Y
						{ type: "Insert", content: [{ id: "O" }], commute: Commutativity.None },
					],
				},
			}],
		}],
	};

	export const e2p: S.Transaction = {
		ref: 0,
		newRef: 1,
		seq: 2,
		frames: [{
			priorMoves: {
				1: [{ src: { foo: 0 }, dst: { bar: 0 } }],
			},
			marks: [{
				modify: {
					foo: [
						{ type: "PriorMoveOutStart", seq: 1, op: 0 },
						1, // Skip A
						{ type: "Insert", content: [{ id: "X" }, { id: "Y" }], commute: Commutativity.Full },
						1, // Skip B
						{ type: "PriorSliceEnd", seq: 1, op: 0 },
					],
				},
			}],
		}],
	};

	export const e2neg: Sq.ChangeFrame = {
		ref: 0,
		minSeq: -2,
		maxSeq: -2,
		marks: [{
			modify: {
				foo: [
					1, // Skip A
					{ type: "Delete", length: 2 },
				],
			},
		}],
	};

	export const e2pos: Sq.ChangeFrame = {
		ref: 0,
		minSeq: 2,
		maxSeq: 2,
		marks: [{
			modify: {
				foo: [
					1, // Skip A
					{
						type: "Insert",
						content: [{ id: "X" }, { id: "Y" }],
						commute: Commutativity.Full,
					},
				],
			},
		}],
	};

	export const e2posp: Sq.ChangeFrame = {
		ref: 0,
		minSeq: 2,
		maxSeq: 2,
		marks: [{
			modify: {
				bar: [
					1, // Skip A
					{
						type: "Insert",
						content: [{ id: "X" }, { id: "Y" }],
						commute: Commutativity.Full,
					},
				],
			},
		}],
	};

	export const e3neg: Sq.ChangeFrame = {
		ref: 0,
		minSeq: -3,
		maxSeq: -3,
		marks: [{
			modify: {
				foo: [
					2, // Skip A X
					{ type: "Delete" },
				],
			},
		}],
	};

	export const e3pos: Sq.ChangeFrame = {
		ref: 0,
		minSeq: 3,
		maxSeq: 3,
		marks: [{
			modify: {
				foo: [
					2, // Skip A X
					{
						type: "Insert",
						content: [{ id: "N" }],
						commute: Commutativity.None,
					},
				],
			},
		}],
	};

	export const e3posp: Sq.ChangeFrame = {
		ref: 0,
		minSeq: 3,
		maxSeq: 3,
		marks: [{
			modify: {
				foo: [
					{ type: "PriorDetach", seq: 1 },
					{ type: "PriorDetach", seq: -2 },
					{
						type: "Insert",
						content: [{ id: "N" }],
						commute: Commutativity.None,
					},
					{ type: "PriorDetach", seq: -2 },
					{ type: "PriorDetach", seq: 1 },
				],
			},
		}],
	};

	export const e4neg: Sq.ChangeFrame = {
		ref: 0,
		minSeq: -4,
		maxSeq: -4,
		marks: [{
			modify: {
				foo: [
					1, // Skip A
					{ type: "Delete" },
				],
			},
		}],
	};

	export const e4pos: Sq.ChangeFrame = {
		ref: 0,
		minSeq: 4,
		maxSeq: 4,
		marks: [{
			modify: {
				foo: [
					1, // Skip A
					{ type: "Insert", content: [{ id: "M" }], side: Sibling.Next, commute: Commutativity.None },
				],
			},
		}],
	};

	export const e4posp: Sq.ChangeFrame = {
		ref: 0,
		minSeq: 4,
		maxSeq: 4,
		marks: [{
			modify: {
				foo: [
					{ type: "PriorDetach", seq: 1 },
					{
						type: "Insert",
						content: [{ id: "M" }],
						commute: Commutativity.None,
					},
					{ type: "PriorDetach", seq: -2 },
					1,
					{ type: "PriorDetach", seq: -2 },
					{ type: "PriorDetach", seq: 1 },
				],
			},
		}],
	};

	export const e3d: Sq.ChangeFrame = {
		ref: 0,
		minSeq: -2,
		maxSeq: 2,
		moves: [{ src: { foo: 0 }, dst: { bar: 0 } }],
		marks: [{
			modify: {
				foo: [
					{ type: "MoveOutStart", op: 0 },
					4, // Skip A X Y B
					{ type: "End", side: Sibling.Next, op: 0 },
				],
				bar: [
					{ type: "MoveInSlice", op: 0 }, // A X Y B
				],
			},
		}],
	};

	export const e4d: Sq.ChangeFrame = {
		ref: 0,
		minSeq: -3,
		maxSeq: 3,
		moves: [{ src: { foo: 0 }, dst: { bar: 0 } }],
		marks: [{
			modify: {
				foo: [
					{ type: "MoveOutStart", op: 0 },
					1, // Skip A
					{ type: "Delete" }, // X
					1, // N
					{ type: "Delete" }, // Y
					1, // Skip B
					{ type: "End", side: Sibling.Next, op: 0 },
				],
				bar: [
					{ type: "MoveInSlice", op: 0 }, // A
					{ type: "Insert", content: [{ id: "X" }, { id: "Y" }], commute: Commutativity.Full },
					{ type: "MoveInSlice", op: 0 }, // B
				],
			},
		}],
	};

	export const e5d: Sq.ChangeFrame = {
		ref: 0,
		minSeq: -4,
		maxSeq: 4,
		moves: [{ src: { foo: 0 }, dst: { bar: 0 } }],
		marks: [{
			modify: {
				foo: [
					{ type: "MoveOutStart", op: 0 },
					2, // Skip A M
					{ type: "Delete" }, // X
					1, // N
					{ type: "Delete" }, // Y
					1, // Skip B
					{ type: "End", side: Sibling.Next, op: 0 },
				],
				bar: [
					{ type: "MoveInSlice", op: 0 }, // A
					{ type: "Insert", content: [{ id: "X" }, { id: "Y" }], commute: Commutativity.Full },
					{ type: "MoveInSlice", op: 0 }, // B
				],
			},
		}],
	};

	export const e3p: S.Transaction = {
		ref: 0,
		newRef: 2,
		seq: 3,
		frames: [{
			marks: [{
				modify: {
					foo: [
						{ type: "PriorDetach", seq: 1 }, // A
						{ type: "PriorDetach", seq: -2 }, // X
						{ type: "Insert", content: [{ id: "N" }], commute: Commutativity.None },
					],
				},
			}],
		}],
	};

	export const e4p: S.Transaction = {
		ref: 0,
		newRef: 3,
		seq: 4,
		frames: [{
			marks: [{
				modify: {
					foo: [
						{ type: "PriorDetach", seq: 1 }, // A
						{ type: "Insert", content: [{ id: "M" }], commute: Commutativity.None },
					],
				},
			}],
		}],
	};

	export const e5p: S.Transaction = {
		ref: 0,
		newRef: 3,
		seq: 4,
		frames: [{
			marks: [{
				modify: {
					foo: [
						{ type: "PriorDetach", seq: 1 }, // A
						1, // M
						{ type: "PriorDetach", seq: -2 }, // X
						1, // N
						{ type: "PriorDetach", seq: -2 }, // Y
						{ type: "Insert", content: [{ id: "O" }], commute: Commutativity.None },
					],
				},
			}],
		}],
	};

	export const originals = [e1, e2, e3, e4, e5];
}

export const allOriginals = [
	...ScenarioA1.originals,
	...ScenarioF.originals,
	...ScenarioG.originals,
];
