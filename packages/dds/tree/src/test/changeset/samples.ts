/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Effects, Transposed as T, Sequenced as S, Tiebreak } from "../../changeset";

/**
 * Demonstrates how to represent a change that inserts a root tree.
 */
export namespace InsertRoot {
	export const e1: T.FieldMarks = {
		attach: [
			[ // Array of attach operations for index 0
				{
					type: "Insert",
					id: 0, // ID of the insert operation
					content: [ // Serialized trees
						{
							id: "cbb9bf86-12bf-46d2-95e5-bdc50bde3cd0", // ID of the root node
							type: "Point",
							fields: {
								x: [{
									id: "cebb2540-a654-4e1d-8d04-5a678f628c1d", // ID of the X node
									value: 42,
								}],
								y: [{
									id: "2dc94084-dcd5-4141-9eee-fa59f9c4642e", // ID of the Y node
									value: 42,
								}],
								arrayField: [{
									id: "376aa297-4b8b-4d85-ad0f-79ee7e9e6efc",
									type: "JSON-Array",
									fields: {
										entries: [
											{ id: "1a2815ee-0495-4ffa-b958-156abbfbb074", value: 0 },
											{ id: "e39fe778-35ac-4629-b890-5b38bf441984", value: 1 },
										],
									},
								}],
							},
						},
					],
				},
			],
		],
	};
}

/**
 * Demonstrates how to represent a change that swaps a pair of nodes from different traits.
 */
export namespace SwapCousins {
	export const e1: T.Changeset = {
		moves: [
			{ id: 0, src: { foo: 0 }, dst: { bar: 0 } },
			{ id: 1, src: { bar: 0 }, dst: { foo: 0 } },
		],
		marks: {
			modify: [{
				foo: {
					nodes: [{ type: "Move", id: 0, count: 1 }],
					attach: [[{ type: "Move", id: 1, count: 1 }]],
				},
				bar: {
					nodes: [{ type: "Move", id: 1, count: 1 }],
					attach: [[{ type: "Move", id: 0, count: 1 }]],
				},
			}],
		},
	};
}

/**
 * Demonstrates how to represent a change that swaps a node and its child.
 *
 * From: `R{ foo: B{ bar: C{ baz: D } } }`
 * To:  ` R{ foo: C{ bar: B{ baz: D } } }`
 */
export namespace SwapParentChild {
	export const e1: T.Changeset = {
		moves: [
			{ id: 0, src: { foo: 0 }, dst: { foo: { 0: { bar: 0 } } } }, // B
			{ id: 1, src: { foo: { 0: { bar: 0 } } }, dst: { foo: 0 } }, // C
			{ // D
				id: 2,
				src: { foo: { 0: { bar: { 0: { baz: 0 } } } } },
				dst: { foo: { 0: { bar: { 0: { baz: 0 } } } } },
			},
		],
		marks: {
			modify: [{
				foo: {
					nodes: [{ type: "Move", id: 0, count: 1 }],
					modify: [{
						bar: {
							nodes: [{ type: "Move", id: 1, count: 1 }],
							modify: [{
								baz: {
									nodes: [{ type: "Move", id: 2, count: 1 }],
								},
								bar: {
									attach: [
										[{ type: "Move", id: 0, count: 1 }],
									],
								},
							}],
						},
						baz: {
							attach: [
								[{ type: "Move", id: 2, count: 1 }],
							],
						},
					}],
					attach: [
						[{ type: "Move", id: 1, count: 1 }],
					],
				},
			}],
		},
	};
}

/**
 * This scenario demonstrates the need to use tombstones in order to precisely describe the
 * extent of slice ranges that cover concurrently deleted content.
 *
 * Without a tombstone to represent B and C, the slice range [C D] would not include the gap
 * between B and C, which would leave the insertion of X unaffected by the slice.
 *
 * Starting state foo=[A B C D]
 * User 1: set-delete B C
 * User 2: move slice-like range B C D to some other trait bar
 * User 3: insert X before C (commutative)
 *
 * Expected outcome: foo=[A] bar=[X D]
 */
export namespace ScenarioA {
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		marks: {
			modify: [{
				foo: {
					nodes: [
						1, // A
						{ type: "Delete", id: 0, count: 2 },
					],
				},
			}],
		},
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
		marks: {
		modify: [{
			foo: {
				nodes: [
					1, // A
					{ type: "Move", id: 0, count: 3 },
				],
				gaps: [
					2,
					{ count: 2, stack: [{ type: "Forward", id: 0 }] },
				],
			},
			bar: {
				attach: [
					[{ type: "Move", id: 0, count: 3 }],
				],
			},
		}],
		},
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		marks: {
			modify: [{
				foo: {
					attach: [
						2,
						[{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.All }],
					],
				},
			}],
		},
	};

	export const e2_r_e1: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
		marks: {
			modify: [{
				foo: {
					tombs: [1, { count: 2, seq: 1 }],
					nodes: [
						1, // A
						{ type: "Move", id: 0, count: 3 },
					],
					gaps: [
						2,
						{ count: 2, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				bar: {
					attach: [
						[{ type: "Move", id: 0, count: 1 /* <-Updated */ }],
					],
				},
			}],
		},
	};

	export const e3_r_e1: S.Transaction = {
		seq: 3,
		ref: 0,
		newRef: 1,
		marks: {
			modify: [{
				foo: {
					tombs: [1, { count: 2, seq: 1 }],
					attach: [
						2,
						[{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.All }],
					],
				},
			}],
		},
	};

	export const e3_r_e2: S.Transaction = {
		seq: 3,
		ref: 0,
		newRef: 2,
		moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
		marks: {
			modify: [{
				foo: {
					tombs: [1, { count: 2, seq: 1 }],
					attach: [
						2,
						[{ type: "Bounce", id: 0, heed: Effects.All }],
					],
				},
				bar: {
					attach: [
						1,
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "X" }],
							src: { seq: 2, id: 0 },
							heed: Effects.All,
						}],
					],
				},
			}],
		},
	};

	export const originals = [e1, e2, e3];
}

/**
 * Demonstrates the need for tombstones in order for multiple concurrent inserts
 * to be ordered corrected with respect to one another.
 *
 * Starting state: foo=[A B C D E]
 * U1: set-delete whole trait
 * U2: insert W before B and Y before D
 * U3: insert X before C and Z before E
 * Expected outcome: foo=[W X Y Z]
 */
export namespace ScenarioB {
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Delete", id: 0, count: 5 },
					],
				},
			}],
		},
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		marks: {
			modify: [{
				foo: {
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "W" }] }],
						1,
						[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
					],
				},
			}],
		},
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		marks: {
			modify: [{
				foo: {
					attach: [
						2,
						[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
						1,
						[{ type: "Insert", id: 0, content: [{ id: "Z" }] }],
					],
				},
			}],
		},
	};

	export const e2_r_e1: S.Transaction = {
		ref: 0,
		seq: 2,
		newRef: 1,
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 5, seq: 1 }],
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "W" }] }],
						1,
						[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
					],
				},
			}],
		},
	};

	export const e3_r_e1: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 2,
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 5, seq: 1 }],
					attach: [
						2,
						[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
						1,
						[{ type: "Insert", id: 0, content: [{ id: "Z" }] }],
					],
				},
			}],
		},
	};

	export const e3_r_e2: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 2,
		marks: {
			modify: [{
				foo: {
					tombs: [
						{ count: 1, seq: 1 },
						1, // W
						{ count: 2, seq: 1 },
						1, // Y
						{ count: 1, seq: 1 },
					],
					attach: [
						3, // [-A-W-B
						[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
						2, // C-Y-D
						[{ type: "Insert", id: 0, content: [{ id: "Z" }] }],
					],
				},
			}],
		},
	};
}

/**
 * Demonstrates how multiple deletes of the same node interact.
 * Specifically, it shows that it is not necessary for a deletion to keep a list of all prior
 * deletes that targeted the same node. It is sufficient to only recall the first prior delete.
 *
 * In trait foo [A]:
 * E1: User 1: set-delete A
 * E2: User 1: undo
 * E3: User 2: set-delete A
 * E4: User 3: set-delete A
 *
 * Expected outcome: foo=[]
 * A should be deleted by user 2's edit.
 * User 3's edit should be muted.
 */
export namespace ScenarioC {
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Delete", id: 0, count: 1 },
					],
				},
			}],
		},
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 1,
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 1, seq: 1 }],
					nodes: [
						{ type: "Revive", id: 0, count: 1 },
					],
				},
			}],
		},
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Delete", id: 0, count: 1 },
					],
				},
			}],
		},
	};

	export const e3_r_e1: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 1,
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 1, seq: 1 }],
					nodes: [
						{ type: "Delete", id: 0, count: 1 },
					],
				},
			}],
		},
	};

	export const e3_r_e2: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 2,
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Delete", id: 0, count: 1 },
					],
				},
			}],
		},
	};

	export const e4: S.Transaction = {
		ref: 0,
		seq: 4,
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Delete", id: 0, count: 1 },
					],
				},
			}],
		},
	};

	export const e4_r_e1: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 1,
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 1, seq: 1 }],
					nodes: [
						{ type: "Delete", id: 0, count: 1 },
					],
				},
			}],
		},
	};

	export const e4_r_e2: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 2,
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Delete", id: 0, count: 1 },
					],
				},
			}],
		},
	};

	export const e4_r_e3: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 3,
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 1, seq: 1 }],
					nodes: [
						{ type: "Delete", id: 0, count: 1 },
					],
				},
			}],
		},
	};
}

/**
 * Demonstrates how to represent a silenced insert.
 *
 * Starting state: foo=[A B]
 * E1: User 1: slice-delete [A B]
 * E2: User 2: insert X at index 1 (commute:all)
 *
 * Expected outcome: foo=[]
 * User 2's edit should be muted.
 */
export namespace ScenarioD {
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Delete", id: 0, count: 2 },
					],
					gaps: [
						{ count: 1, stack: [{ type: "Scorch", id: 0 }] },
					],
				},
			}],
		},
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		marks: {
			modify: [{
				foo: {
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
					],
				},
			}],
		},
	};

	export const e2_r_e1: S.Transaction = {
		ref: 0,
		seq: 2,
		newRef: 1,
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 1 }],
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "X" }], scorch: { seq: 1, id: 0 } }],
					],
				},
			}],
		},
	};
}

/**
 * This scenario demonstrates how subsequent changes within the same commit affect prior changes
 * in the same commit even if concurrent changes sequenced prior would also affect those prior
 * changes. One could say subsequent changes within the same commit trump concurrent changes in
 * that respect.
 *
 * In trait foo [A B]:
 *  User 1: move slice A[_]B to some other trait bar
 *  User 2 in one commit:
 *  insert X before B (with commutative-move semantics)
 *  delete slice-like range [A X B]
 *
 * Expected outcome: foo=[] bar=[]
 * X is deleted (as opposed to inserted in trait bar).
 */
export namespace ScenarioE {
	export const e1: S.Transaction = {
		seq: 1,
		ref: 0,
		moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 0 } }],
		marks: {
			modify: [{
				foo: {
					gaps: [
						1,
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				bar: {
					attach: [
						[{ type: "Move", id: 0, count: 1 }],
					],
				},
			}],
		},
	};

	export const e2: S.Transaction = {
		seq: 2,
		ref: 0,
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Delete", id: 0, count: 2 },
					],
					gaps: [
						1,
						{ count: 1, stack: [{ type: "Scorch", id: 0 }] },
					],
				},
			}],
		},
	};

	export const e2_r_e1: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Delete", id: 0, count: 2 },
					],
					gaps: [
						1,
						{ count: 1, stack: [{ type: "Scorch", id: 0 }] },
					],
				},
			}],
		},
	};
}

/*
 * starting state: [A B] (known to both client 1 and client 2)
 * 	Edit #1 by client 1: insert [r] at index 0 (local state: [r A B])
 * 	Edit #2 by client 2: insert [xz] at index 1 (local state: [A x z B])
 * 	Edit #3 by client 2: insert [y] at index 2 (local state: [A x y z B])
 *
 * Expected outcome: [r A x y z B]
 */
export namespace ScenarioF {
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		marks: {
			modify: [{
				foo: {
					attach: [
						[{ type: "Insert", id: 0, content: [{ id: "r" }] }],
					],
				},
			}],
		},
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		marks: {
			modify: [{
				foo: {
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "x" }, { id: "z" }] }],
					],
				},
			}],
		},
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		marks: {
			modify: [{
				foo: {
					attach: [
						2,
						[{ type: "Insert", id: 0, content: [{ id: "y" }] }],
					],
				},
			}],
		},
	};

	export const e2_r_e1: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		marks: {
			modify: [{
				foo: {
					attach: [
						2,
						[{ type: "Insert", id: 0, content: [{ id: "x" }, { id: "z" }] }],
					],
				},
			}],
		},
	};

	export const e1_p_e2: T.Changeset = {
		marks: {
			modify: [{
				foo: {
					attach: [
						[{ type: "Insert", id: 0, content: [{ id: "r" }] }],
					],
				},
			}],
		},
	};

	export const e3_r_e2: S.Transaction = {
		seq: 3,
		ref: 0,
		newRef: 2,
		marks: {
			modify: [{
				foo: {
					attach: [
						3,
						[{ type: "Insert", id: 0, content: [{ id: "y" }] }],
					],
				},
			}],
		},
	};

	export const originals = [e1, e2, e3];
}

/*
 * This scenario demonstrates the need to have tombstones for moved-out content.
 * It is also a testing ground for the rebasing of dependent changes.
 *
 * In trait foo [A B]:
 * 	E1: User 1: move slice [A B] to some other trait bar
 * 	E2: User 2: insert [X Y] before B (commute:move) (local: [A X Y B])
 * 	E3: User 2: insert N before Y (commute:none) (local: [A X N Y B])
 * 	E4: User 2: insert M before X (commute:none) (local: [A M X N Y B])
 * 	E5: User 2: insert O before B (commute:none) (local: [A M X N Y O B])
 *
 * Expected outcome: foo=[M N O] bar=[A X Y B]
 */
export namespace ScenarioG {
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Move", id: 0, count: 2 },
					],
					gaps: [
						1,
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				bar: {
					attach: [
						[{ type: "Move", id: 0, count: 2 }],
					],
				},
			}],
		},
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		marks: {
			modify: [{
				foo: {
					attach: [
						1,
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "X" }, { id: "Y" }],
							heed: Effects.Move,
						}],
					],
				},
			}],
		},
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		marks: {
			modify: [{
				foo: {
					attach: [
						2,
						[{ type: "Insert", id: 0, content: [{ id: "N" }], heed: Effects.None }],
					],
				},
			}],
		},
	};

	export const e4: S.Transaction = {
		ref: 0,
		seq: 4,
		marks: {
			modify: [{
				foo: {
					attach: [
						1, // Before X
						[{ type: "Insert", id: 0, content: [{ id: "M" }], heed: Effects.None }],
					],
				},
			}],
		},
	};

	export const e5: S.Transaction = {
		ref: 0,
		seq: 5,
		marks: {
			modify: [{
				foo: {
					attach: [
						5,
						[{ type: "Insert", id: 0, content: [{ id: "O" }], heed: Effects.None }],
					],
				},
			}],
		},
	};

	export const e2_r_e1: S.Transaction = {
		seq: 2,
		ref: 0,
		newRef: 1,
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 1 }],
					attach: [
						1,
						[{ type: "Bounce", id: 0, heed: Effects.Move }],
					],
				},
				bar: {
					attach: [
						1,
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "X" }, { id: "Y" }],
							src: { seq: 1, id: 0 },
							heed: Effects.Move,
						}],
					],
				},
			}],
		},
	};

	export const e1_p_e2: T.Changeset = {
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Move", id: 0, count: 4 }, // A X Y B
					],
					gaps: [
						1,
						{ count: 3, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				bar: {
					attach: [
						[{ type: "Move", id: 0, count: 4 }],
					],
				},
			}],
		},
	};

	export const e3_r_e2: S.Transaction = {
		seq: 3,
		ref: 0,
		newRef: 2,
		marks: {
			modify: [{
				foo: {
					tombs: [
						{ count: 1, seq: 1 }, // A
						{ count: 2, seq: [1, 2] }, // X Y
						{ count: 1, seq: 1 }, // B
					],
					attach: [
						2,
						[{ type: "Insert", id: 0, content: [{ id: "N" }], heed: Effects.None }],
					],
				},
			}],
		},
	};

	export const e1_p_e3: T.Changeset = {
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Move", id: 0, count: 2 }, // A X
						1, // N
						{ type: "Move", id: 0, count: 2 }, // Y B
					],
					gaps: [
						1, // [-A
						{ count: 4, stack: [{ type: "Forward", id: 0 }] }, // A-X-N-B-Y
					],
				},
				bar: {
					attach: [
						[{ type: "Move", id: 0, count: 4 }],
					],
				},
			}],
		},
	};

	export const e4_r_e3: S.Transaction = {
		seq: 4,
		ref: 0,
		newRef: 3,
		marks: {
			modify: [{
				foo: {
					tombs: [
						{ count: 1, seq: 1 }, // A
						{ count: 1, seq: [1, 2] }, // X
						1, // N
						{ count: 1, seq: [1, 2] }, // Y
						{ count: 1, seq: 1 }, // B
					],
					attach: [
						1, // [-A
						[{ type: "Insert", id: 0, content: [{ id: "M" }], heed: Effects.None }],
					],
				},
			}],
		},
	};

	export const e1_p_e4: T.Changeset = {
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Move", id: 0, count: 1 }, // A
						1, // M
						{ type: "Move", id: 0, count: 1 }, // X
						1, // N
						{ type: "Move", id: 0, count: 2 }, // Y B
					],
					gaps: [
						1, // [-A
						{ count: 5, stack: [{ type: "Forward", id: 0 }] }, // A-M-X-N-B-Y
					],
				},
				bar: {
					attach: [
						[{ type: "Move", id: 0, count: 4 }],
					],
				},
			}],
		},
	};

	export const e5_r_e4: S.Transaction = {
		seq: 5,
		ref: 0,
		newRef: 3,
		marks: {
			modify: [{
				foo: {
					tombs: [
						{ count: 1, seq: 1 }, // A
						1, // M
						{ count: 1, seq: [1, 2] }, // X
						1, // N
						{ count: 1, seq: [1, 2] }, // Y
						{ count: 1, seq: 1 }, // B
					],
					attach: [
						5,
						[{ type: "Insert", id: 0, content: [{ id: "O" }], heed: Effects.None }],
					],
				},
			}],
		},
	};

	export const originals = [e1, e2, e3, e4, e5];
}

/**
 * This scenario demonstrates how commutative inserts are only affected by the slice range they
 * fall within, as opposed to also being affected by a slice range that the slice range they fall
 * within falls within. It is up to the slice-range the insert falls within to determine whether
 * it commutes with a slice range at its destination, thus indirectly affecting the final location
 * of the insert.
 *
 * Starting state: foo=[A B] bar=[U V] baz=[]
 * 	User 1: slice-move all of trait foo before V with a (commute:none)
 * 	User 2: slice-move all of trait bar into trait baz
 * 	User 3: insert X before B and insert Y before the end in foo (commute:all)
 *
 * Expected outcome: foo=[] bar=[A X B Y] baz=[U V]
*/
export namespace ScenarioH {
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 1 } }],
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Move", id: 0, count: 2 },
					],
					gaps: [
						{ count: 3, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				bar: {
					attach: [
						1,
						[{ type: "Move", id: 0, count: 2, heed: Effects.None }],
					],
				},
			}],
		},
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		moves: [{ id: 0, src: { bar: 0 }, dst: { baz: 0 } }],
		marks: {
			modify: [{
				bar: {
					nodes: [
						{ type: "Move", id: 0, count: 2 },
					],
					gaps: [
						{ count: 3, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				baz: {
					attach: [
						[{ type: "Move", id: 0, count: 2 }],
					],
				},
			}],
		},
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		marks: {
			modify: [{
				foo: {
					attach: [
						1, // [-A
						[{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.All }],
						[{ type: "Insert", id: 1, content: [{ id: "Y" }], heed: Effects.All }],
					],
				},
			}],
		},
	};

	export const e2_r_e1: S.Transaction = {
		ref: 0,
		seq: 2,
		newRef: 1,
		moves: [{ id: 0, src: { bar: 0 }, dst: { baz: 0 } }],
		marks: {
			modify: [{
				bar: {
					nodes: [
						{ type: "Move", id: 0, count: 1 },
						2, // A B
						{ type: "Move", id: 0, count: 1 },
					],
					gaps: [
						{ count: 2, stack: [{ type: "Forward", id: 0 }] }, // [-U-A
						1, // A-B
						{ count: 2, stack: [{ type: "Forward", id: 0 }] }, // B-V-[
					],
				},
				baz: {
					attach: [
						[{ type: "Move", id: 0, count: 2 }],
					],
				},
			}],
		},
	};

	export const e3_r_e1: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 1,
		moves: [
			{ id: 0, src: { foo: 1 }, dst: { bar: 2 } },
			{ id: 1, src: { foo: 2 }, dst: { bar: 3 } },
		],
		marks: {
			modify: [{
				foo: {
					tombs: [
						{ count: 2, seq: 1 },
					],
					attach: [
						1, // [-A
						[{ type: "Bounce", id: 0, heed: Effects.All }], // A-B
						[{ type: "Bounce", id: 1, heed: Effects.All }], // B-]
					],
				},
				bar: {
					attach: [
						2, // [-U-A
						[{ // A-B
							type: "Insert",
							id: 0,
							content: [{ id: "X" }],
							src: { seq: 1, id: 0 },
							heed: Effects.None,
						}],
						[{ // B-V
							type: "Insert",
							id: 1,
							content: [{ id: "Y" }],
							src: { seq: 1, id: 0 },
							heed: Effects.None,
						}],
					],
				},
			}],
		},
	};

	export const e3_r_e2: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 2,
		moves: [
			{ id: 0, src: { foo: 1 }, dst: { bar: 1 } },
			{ id: 1, src: { foo: 2 }, dst: { bar: 1 } },
		],
		marks: {
			modify: [{
				foo: {
					tombs: [
						{ count: 2, seq: 1 },
					],
					attach: [
						1, // [-A
						[{ type: "Bounce", id: 0, heed: Effects.All }], // A-B
						[{ type: "Bounce", id: 1, heed: Effects.All }], // B-]
					],
				},
				bar: {
					tombs: [
						{ count: 1, seq: 2 }, // U
						2, // A B
						{ count: 1, seq: 2 }, // V
					],
					attach: [
						2, // [-U-A
						[{ // A-B
							type: "Insert",
							id: 0,
							content: [{ id: "X" }],
							src: { seq: 1, id: 0 },
							heed: Effects.None,
						}],
						[{ // B-V
							type: "Insert",
							id: 1,
							content: [{ id: "Y" }],
							src: { seq: 1, id: 0 },
							heed: Effects.None,
						}],
					],
				},
			}],
		},
	};
}

/**
 * This scenario demonstrates the possibility of creating a circular interaction between slice moves.
 *
 * Starting state: foo=[A B] bar=[X Y]
 * 	User 1: slice-move all of trait foo before Y with a commutative attach
 * 	User 2: slice-move all of trait bar before B with a commutative attach
 *
 * Option 1: The first edit should apply but not the second.
 * 	foo: []
 * 	bar: [X A B Y]
 *
 * Option 2: They both apply but a "don't chase your own tail" rule us applied.
 * This rule would also make sense if we allowed slice ranges to move inside themselves.
 * 	foo: []
 * 	bar: [X A B Y]
 *
 * Option 3: They both apply but the second move's commutativity is ignored.
 * 	foo: [X A B Y]
 * 	bar: []
 *
 * Option 4: The slice-ness of edit 2 is applied to determine that A and B should be moved as
 * well. Then the commutativity of edits 2 is taken into account, at which point the destination
 * of the first move is still considered to be in bar.
 * 	foo: []
 * 	bar: [X A B Y]
 *
 * Even though some of the outcomes are the same, there seems to be semantic differences between
 * options 1, 3, 4. A longer cycles (involving a baz trait might make that clearer).
 * The semantic difference may be about whether the destination of the move is changed, or whether
 * it is preserved, but the content that it brought is affected.
*/

export namespace ScenarioI {
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 1 } }],
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Move", id: 0, count: 2 },
					],
					gaps: [
						{ count: 6, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				bar: {
					attach: [
						1,
						[{ type: "Move", id: 0, count: 2 }],
					],
				},
			}],
		},
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		moves: [{ id: 0, src: { bar: 0 }, dst: { foo: 1 } }],
		marks: {
			modify: [{
				bar: {
					nodes: [
						{ type: "Move", id: 0, count: 2 },
					],
					gaps: [
						{ count: 6, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				foo: {
					attach: [
						1,
						[{ type: "Move", id: 0, count: 2 }],
					],
				},
			}],
		},
	};
}

/**
 * This scenario was originally meant to demonstrate the need to replicate tombstone information when inserting at the
 * destination of a slice-move.
 *
 * This scenario was predicated on the notion that inserts that commuted with a move would be solely represented by a
 * mark at the destination of the move, which forces the format to replicate tombstone information at the destination
 * site. Assuming such a design, a tombstone for B was needed in bar for the representation of e3_r_e2 and e4_r_e2 so
 * that they target gap could differentiated from the gaps targeted by the inserts of e5.
 *
 * Using the current format, this challenge is resolved by looking at the src marks for e3_r_e2 and e4_r_e3 when
 * rebasing e5 over them: the tombstone for B at the src site dictates that W and Z belong on the outside of X and Y.
 *
 * Starting state: foo=[A B C] bar=[]
 * 	1. User 1: set-delete node B
 * 	2. User 2: slice-move _[A B C]_ to trait bar
 * 	3. User 3: insert Y after B (commute:all)
 * 	4. User 4: insert X before B (commute:all)
 * 	5. User 5: insert W after A and insert Z before C (with knowledge with e1 and e2)
 *
 * Expected outcome: foo=[] bar=[A W X Y Z C]
*/
export namespace ScenarioJ {
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		marks: {
			modify: [{
				foo: {
					nodes: [
						1, // A
						{ type: "Delete", id: 0, count: 1 },
					],
				},
			}],
		},
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Move", id: 0, count: 3 },
					],
					gaps: [
						1,
						{ count: 2, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				bar: {
					attach: [
						[{ type: "Move", id: 0, count: 3 }],
					],
				},
			}],
		},
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		marks: {
			modify: [{
				foo: {
					attach: [
						2,
						[{ type: "Insert", id: 0, content: [{ id: "Y" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e4: S.Transaction = {
		ref: 0,
		seq: 4,
		marks: {
			modify: [{
				foo: {
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
					],
				},
			}],
		},
	};

	export const e5: S.Transaction = {
		ref: 2, // With knowledge with e1 and e2
		seq: 5,
		marks: {
			modify: [{
				bar: {
					attach: [
						1,
						[
							{ type: "Insert", id: 0, content: [{ id: "W" }], tiebreak: Tiebreak.Left },
							{ type: "Insert", id: 0, content: [{ id: "Z" }] },
						],
					],
				},
			}],
		},
	};

	export const e2_r_e1: S.Transaction = {
		ref: 0,
		seq: 2,
		newRef: 1,
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
		marks: {
			modify: [{
				foo: {
					tombs: [1, { count: 1, seq: 1 }],
					nodes: [
						{ type: "Move", id: 0, count: 3 },
					],
					gaps: [
						1,
						{ count: 2, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				bar: {
					attach: [
						[{ type: "Move", id: 0, count: 2 /* Updated */ }],
					],
				},
			}],
		},
	};

	export const e3_r_e1: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 1,
		marks: {
			modify: [{
				foo: {
					tombs: [1, { count: 1, seq: 1 }],
					attach: [
						2,
						[{ type: "Insert", id: 0, content: [{ id: "Y" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e3_r_e2: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 2,
		moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 1 } }],
		marks: {
			modify: [{
				foo: {
					tombs: [1, { count: 1, seq: 1 }],
					attach: [
						2,
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Left }],
					],
				},
				bar: {
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
					],
				},
			}],
		},
	};

	export const e4_r_e1: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 1,
		marks: {
			modify: [{
				foo: {
					tombs: [1, { count: 1, seq: 1 }],
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
					],
				},
			}],
		},
	};

	export const e4_r_e2: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 2,
		moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 1 } }],
		marks: {
			modify: [{
				foo: {
					tombs: [1, { count: 1, seq: 1 }],
					attach: [
						1,
						[{ type: "Bounce", id: 0 }],
					],
				},
				bar: {
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
					],
				},
			}],
		},
	};

	export const e4_r_e3: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 3,
		moves: [{ id: 0, src: { foo: 1 }, dst: { bar: 1 } }],
		marks: {
			modify: [{
				foo: {
					tombs: [1, { count: 1, seq: 1 }],
					attach: [
						1,
						[{ type: "Bounce", id: 0 }],
					],
				},
				bar: {
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
					],
				},
			}],
		},
	};

	export const e5_r_e3: S.Transaction = {
		ref: 2,
		seq: 5,
		newRef: 3,
		marks: {
			modify: [{
				bar: {
					attach: [
						1, // [-A
						[{ type: "Insert", id: 0, content: [{ id: "W" }], tiebreak: Tiebreak.Left }], // A-Y
						[{ type: "Insert", id: 0, content: [{ id: "Z" }] }], // Y-]
					],
				},
			}],
		},
	};

	export const e5_r_e4: S.Transaction = {
		ref: 2,
		seq: 5,
		newRef: 4,
		marks: {
			modify: [{
				bar: {
					attach: [
						1, // [-A
						[{ type: "Insert", id: 0, content: [{ id: "W" }], tiebreak: Tiebreak.Left }],
						1, // X-Y
						[{ type: "Insert", id: 0, content: [{ id: "Z" }] }],
					],
				},
			}],
		},
	};
}

/**
 * This scenario was originally a failed attempt to demonstrate the need to differentiate tombstone replicas
 * that are introduced by slice moves from their originals. This was predicated on the notion that inserts that
 * commuted with a move would be solely represented by a mark at the destination of the move, which forces the
 * format to replicate tombstone information at the destination site.
 *
 * Starting state foo=[A]:
 * User 1: set-delete node A
 * User 2: slice-move [A-] to the start of trait foo
 * User 3:
 * 	- insert X at the end of foo (commute:move)
 * 	- insert Y at the end of foo (commute:none)
 *
 * Expected outcome: foo=[X Y]
*/
export namespace ScenarioK {
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Delete", id: 0, count: 1 },
					],
				},
			}],
		},
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		moves: [{ id: 0, src: { foo: 0 }, dst: { foo: 0 } }],
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Move", id: 0, count: 1 },
					],
					gaps: [
						1,
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
					],
					attach: [
						[{ type: "Move", id: 0, count: 1 }],
					],
				},
			}],
		},
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		marks: {
			modify: [{
				foo: {
					attach: [
						1,
						[
							{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.Move },
							{ type: "Insert", id: 1, content: [{ id: "Y" }], heed: Effects.None },
						],
					],
				},
			}],
		},
	};

	export const e2_r_e1: S.Transaction = {
		ref: 0,
		seq: 2,
		newRef: 1,
		moves: [{ id: 0, src: { foo: 0 }, dst: { foo: 0 } }],
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 1, seq: 1 }],
					nodes: [
						{ type: "Move", id: 0, count: 1 },
					],
					gaps: [
						1,
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
					],
					attach: [
						[{ type: "Move", id: 0, count: 0 /* Updated */ }],
					],
				},
			}],
		},
	};

	export const e3_r_e1: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 1,
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 1, seq: 1 }],
					attach: [
						1,
						[
							{ type: "Insert", id: 0, content: [{ id: "X" }], heed: Effects.Move },
							{ type: "Insert", id: 1, content: [{ id: "Y" }], heed: Effects.None },
						],
					],
				},
			}],
		},
	};

	export const e3_r_e2: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 2,
		moves: [{ id: 0, src: { foo: 0 }, dst: { foo: 0 } }],
		marks: {
			modify: [{
				foo: {
					tombs: [
						{ count: 1, seq: 1 },
					],
					attach: [
						[
							{
								type: "Insert",
								id: 0,
								content: [{ id: "X" }],
								src: { seq: 2, id: 0 },
							},
						],
						[
							{ type: "Bounce", id: 0, heed: Effects.Move },
							{ type: "Insert", id: 1, content: [{ id: "Y" }], heed: Effects.None },
						],
					],
				},
			}],
		},
	};
}

/**
 * This scenario was originally meant to demonstrate that two different tombstones can have originated from the same
 * edit (E1), been first replicated by the same slice-move (E2), been last replicated by the same
 * slice-move (E4) yet be targeted by different concurrent inserts that end up in the same trait
 * and therefore need to be able to distinguish one replica from the other, and order them properly.
 *
 * This scenario was predicated on the notion that inserts that commuted with a move would be solely represented by a
 * mark at the destination of the move, which forces the format to replicate tombstone information at the destination
 * site. Assuming such a design, the tombstones from E1 end up duplicated in qux, with no way to tell them apart.
 * Note how the slice-moves in E3 flip the order of X and Y. This was done to help distinguish designs where the two
 * tombstones are successfully told apart from designs where they are not. Indeed, without this flip, they would have
 * the same outcome.
 *
 * The current format does not rely on tombstone replication at move destination sites so the issue does not come up.
 *
 * Starting with traits foo=[A B], bar=[], baz=[], qux=[]:
 * 	E1: User 1: set-delete nodes A B
 * 	E2: User 2: slice-move all of foo to the start of trait bar
 * 	E3: User 2:
 * 	slice-move foo [_A] to the end of trait baz
 * 	slice-move foo [B_] to the start of trait baz
 * 	E4: User 2: slice-move all of baz to the start of trait qux
 * 	E5: User 3: insert X after B (commute:all)
 * 	E6: User 3: insert Y before A (commute:all)
 *
 * Expected outcome: qux=[X Y]
 */
export namespace ScenarioL {
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Delete", id: 0, count: 2 },
					],
				},
			}],
		},
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Move", id: 0, count: 2 },
					],
					gaps: [
						{ count: 3, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				bar: {
					attach: [
						[{ type: "Move", id: 0, count: 2, tiebreak: Tiebreak.Right }],
					],
				},
			}],
		},
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		moves: [
			{ id: 0, src: { bar: 0 }, dst: { baz: 0 } },
			{ id: 1, src: { bar: 1 }, dst: { baz: 0 } },
		],
		marks: {
			modify: [{
				bar: {
					nodes: [
						{ type: "Move", id: 0, count: 1 },
						{ type: "Move", id: 1, count: 1 },
					],
					gaps: [
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
						1, // A-B
						{ count: 1, stack: [{ type: "Forward", id: 1 }] },
					],
				},
				baz: {
					attach: [
						[{ type: "Move", id: 1, count: 1, tiebreak: Tiebreak.Left }],
						[{ type: "Move", id: 0, count: 1, tiebreak: Tiebreak.Right }],
					],
				},
			}],
		},
	};

	export const e4: S.Transaction = {
		ref: 0,
		seq: 4,
		moves: [{ id: 0, src: { baz: 0 }, dst: { qux: 0 } }],
		marks: {
			modify: [{
				baz: {
					nodes: [
						{ type: "Move", id: 0, count: 2 },
					],
					gaps: [
						{ count: 3, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				qux: {
					attach: [
						[{ type: "Move", id: 0, count: 2, tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e5: S.Transaction = {
		ref: 0,
		seq: 5,
		marks: {
			modify: [{
				foo: {
					attach: [
						2,
						[{ type: "Insert", id: 0, content: [{ id: "X" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e6: S.Transaction = {
		ref: 0,
		seq: 6,
		marks: {
			modify: [{
				foo: {
					attach: [
						[{ type: "Insert", id: 0, content: [{ id: "Y" }], tiebreak: Tiebreak.Right }],
					],
				},
			}],
		},
	};

	export const e2_r_e1: S.Transaction = {
		ref: 0,
		seq: 2,
		newRef: 1,
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 1 }],
					nodes: [
						{ type: "Move", id: 0, count: 2 },
					],
					gaps: [
						{ count: 3, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				bar: {
					attach: [
						[{ type: "Move", id: 0, count: 0, tiebreak: Tiebreak.Right }],
					],
				},
			}],
		},
	};

	export const e3_r_e1: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 1,
		moves: [
			{ id: 0, src: { bar: 0 }, dst: { baz: 0 } },
			{ id: 1, src: { bar: 1 }, dst: { baz: 0 } },
		],
		marks: {
			modify: [{
				bar: {
					tombs: [{ count: 2, seq: [1, 2] }],
					nodes: [
						{ type: "Move", id: 0, count: 1 },
						{ type: "Move", id: 1, count: 1 },
					],
					gaps: [
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
						1, // A-B
						{ count: 1, stack: [{ type: "Forward", id: 1 }] },
					],
				},
				baz: {
					attach: [
						[{ type: "Move", id: 1, count: 0, tiebreak: Tiebreak.Left }],
						[{ type: "Move", id: 0, count: 0, tiebreak: Tiebreak.Right }],
					],
				},
			}],
		},
	};

	export const e4_r_e1: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 1,
		moves: [{ id: 0, src: { baz: 0 }, dst: { qux: 0 } }],
		marks: {
			modify: [{
				baz: {
					tombs: [{ count: 2, seq: [1, 3] }],
					nodes: [
						{ type: "Move", id: 0, count: 2 },
					],
					gaps: [
						{ count: 3, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				qux: {
					attach: [
						[{ type: "Move", id: 0, count: 0, tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e5_r_e1: S.Transaction = {
		ref: 0,
		seq: 5,
		newRef: 1,
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 1 }],
					attach: [
						2,
						[{ type: "Insert", id: 0, content: [{ id: "X" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e5_r_e2: S.Transaction = {
		ref: 0,
		seq: 5,
		newRef: 2,
		moves: [{ id: 0, src: { foo: 2 }, dst: { bar: 0 } }],
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 1 }],
					attach: [
						2,
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Left }],
					],
				},
				bar: {
					attach: [
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "X" }],
							src: { seq: 2, id: 0 },
							tiebreak: Tiebreak.Left,
						}],
					],
				},
			}],
		},
	};

	export const e5_r_e3: S.Transaction = {
		ref: 0,
		seq: 5,
		newRef: 3,
		moves: [{ id: 0, src: { foo: 2 }, hops: [{ bar: 0 }], dst: { baz: 0 } }],
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 1 }],
					attach: [
						2,
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Left }],
					],
				},
				bar: {
					attach: [
						[{ type: "Bounce", id: 0, src: { seq: 2, id: 0 }, tiebreak: Tiebreak.Left }],
					],
				},
				baz: {
					attach: [
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "X" }],
							src: { seq: 3, id: 1 },
							tiebreak: Tiebreak.Left,
						}],
					],
				},
			}],
		},
	};

	export const e5_r_e4: S.Transaction = {
		ref: 0,
		seq: 5,
		newRef: 4,
		moves: [{ id: 0, src: { foo: 2 }, hops: [{ bar: 0 }, { baz: 0 }], dst: { qux: 0 } }],
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 1 }],
					attach: [
						2,
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Left }],
					],
				},
				bar: {
					attach: [
						[{ type: "Bounce", id: 0, src: { seq: 2, id: 0 }, tiebreak: Tiebreak.Left }],
					],
				},
				baz: {
					attach: [
						[{ type: "Bounce", id: 0, src: { seq: 3, id: 1 }, tiebreak: Tiebreak.Left }],
					],
				},
				qux: {
					attach: [
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "X" }],
							src: { seq: 4, id: 0 },
							tiebreak: Tiebreak.Left,
						}],
					],
				},
			}],
		},
	};

	export const e6_r_e1: S.Transaction = {
		ref: 0,
		seq: 6,
		newRef: 1,
			marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 1 }],
					attach: [
						[{ type: "Insert", id: 0, content: [{ id: "Y" }], tiebreak: Tiebreak.Right }],
					],
				},
			}],
		},
	};

	export const e6_r_e2: S.Transaction = {
		ref: 0,
		seq: 6,
		newRef: 2,
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 0 } }],
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 1 }],
					attach: [
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Right }],
					],
				},
				bar: {
					attach: [
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "Y" }],
							src: { seq: 2, id: 0 },
							tiebreak: Tiebreak.Left,
						}],
					],
				},
			}],
		},
	};

	export const e6_r_e3: S.Transaction = {
		ref: 0,
		seq: 6,
		newRef: 3,
		moves: [{ id: 0, src: { foo: 0 }, hops: [{ bar: 0 }], dst: { baz: 0 } }],
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 1 }],
					attach: [
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Right }],
					],
				},
				bar: {
					attach: [
						[{ type: "Bounce", id: 0, src: { seq: 2, id: 0 }, tiebreak: Tiebreak.Left }],
					],
				},
				baz: {
					attach: [
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "Y" }],
							src: { seq: 3, id: 0 },
							tiebreak: Tiebreak.Right,
						}],
					],
				},
			}],
		},
	};

	export const e6_r_e4: S.Transaction = {
		ref: 0,
		seq: 6,
		newRef: 4,
		moves: [{ id: 0, src: { foo: 0 }, hops: [{ bar: 0 }, { baz: 0 }], dst: { qux: 0 } }],
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 1 }],
					attach: [
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Right }],
					],
				},
				bar: {
					attach: [
						[{ type: "Bounce", id: 0, src: { seq: 2, id: 0 }, tiebreak: Tiebreak.Left }],
					],
				},
				baz: {
					attach: [
						[{ type: "Bounce", id: 0, src: { seq: 3, id: 0 }, tiebreak: Tiebreak.Right }],
					],
				},
				qux: {
					attach: [
						[{
							type: "Insert", id: 0,
							content: [{ id: "Y" }],
							src: { seq: 4, id: 0 },
							tiebreak: Tiebreak.Left,
						}],
					],
				},
			}],
		},
	};

	export const e6_r_e5: S.Transaction = {
		ref: 0,
		seq: 6,
		newRef: 5,
		moves: [{ id: 0, src: { foo: 0 }, hops: [{ bar: 0 }, { baz: 0 }], dst: { qux: 0 } }],
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 1 }],
					attach: [
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Right }],
					],
				},
				bar: {
					attach: [
						[{ type: "Bounce", id: 0, src: { seq: 2, id: 0 }, tiebreak: Tiebreak.Left }],
					],
				},
				baz: {
					attach: [
						[{ type: "Bounce", id: 0, src: { seq: 3, id: 0 }, tiebreak: Tiebreak.Right }],
					],
				},
				qux: {
					attach: [
						1,
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "Y" }],
							src: { seq: 4, id: 0 },
							tiebreak: Tiebreak.Left,
						}],
					],
				},
			}],
		},
	};
}

/*
 * This scenario demonstrates the need for changesets to record all the tombstones for each field
 * that they are targeting. More precisely, it is necessary to record all tombstones that are
 * adjacent to currently recorded tombstones, but recording all of them leads to simpler rebase code.
 *
 * In this scenario, if each insert changeset only stored the tombstone that is relevant to its
 * insert's target location then, when rebasing edit 4 over edit 3, we wouldn't know how to order
 * the tombstones for A B relative to the tombstones for C D.
 *
 * Starting state: foo=[A B C D]
 * User 1: set-delete A B
 * User 2: set-delete C D
 * User 3: insert X before B
 * User 4: insert Y before D
 * Expected outcome: foo=[X Y]
 */
export namespace ScenarioM {
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Delete", id: 0, count: 2 },
					],
				},
			}],
		},
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		marks: {
			modify: [{
				foo: {
					nodes: [
						2, // A B
						{ type: "Delete", id: 0, count: 2 },
					],
				},
			}],
		},
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		marks: {
			modify: [{
				foo: {
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
					],
				},
			}],
		},
	};

	export const e4: S.Transaction = {
		ref: 0,
		seq: 4,
		marks: {
			modify: [{
				foo: {
					attach: [
						3,
						[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
					],
				},
			}],
		},
	};

	export const e2_r_e1: S.Transaction = {
		ref: 0,
		seq: 2,
		newRef: 1,
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Delete", id: 0, count: 2 },
					],
				},
			}],
		},
	};

	export const e3_r_e1: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 1,
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 1 }],
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
					],
				},
			}],
		},
	};

	export const e3_r_e2: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 2,
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 1 }, { count: 2, seq: 2 }],
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
					],
				},
			}],
		},
	};

	export const e4_r_e1: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 1,
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 1 }],
					attach: [
						3,
						[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
					],
				},
			}],
		},
	};

	export const e4_r_e2: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 2,
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 1 }, { count: 2, seq: 2 }],
					attach: [
						3,
						[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
					],
				},
			}],
		},
	};

	export const e4_r_e3: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 3,
		marks: {
			modify: [{
				foo: {
					tombs: [
						{ count: 1, seq: 1 },
						1, // X
						{ count: 1, seq: 1 },
						{ count: 1, seq: 2 },
					],
					attach: [
						4, // [-A-X-B-C
						[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
					],
				},
			}],
		},
	};
}

/**
 * This scenario was originally meant to demonstrate that to successfully order two tombstones that are relied on by
 * separate changes, we need to include synthetic tombstones for orphan gaps at the edge of the range when rebasing
 * over slice move-ins.
 *
 * This scenario was predicated on the notion that inserts that commuted with a move would be solely represented by a
 * mark at the destination of the move, which forces the format to replicate tombstone information at the destination
 * site. Assuming such a design, if E2 and E3 don't record synthetic tombstones when rebasing over e1, then the
 * rebasing of e3_r_e1 over e2_r_e1 will not know how to order the inserts.
 *
 * This design is no longer in effect so the need for synthetic tombstones is moot.
 * That said, this scenario is still interesting in that it reveals the need for sliced inserts to either:
 *
 *   (I) Understand the relative ordering in time of prior moves, even when those slice moves are within the same
 *   transaction. In this scenario, the time ordering tells us that X should go before Y in bar, because the A[_]B
 *   slice move happened before the B[_]C slice move.
 *
 *  (II) Leave "Intake" marks in the changesets that rebased over them when those changesets include an attach that
 *  targets the same gap. This is the approach chosen here.
 *
 * Starting with traits foo=[A B C], bar=[]:
 * E1: User 1:
 * 	slice-move foo A[_]B to the end of trait bar
 * 	slice-move foo B[_]C to the end of trait bar
 * E2: User 2: insert Y before C (commute:all)
 * E3: User 3: insert X before B (commute:all)
 *
 * Expected outcome: foo=[A B C] bar=[X Y]
 */
export namespace ScenarioN {
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		moves: [
			{ id: 0, src: { foo: 1 }, dst: { bar: 0 } },
			{ id: 1, src: { foo: 2 }, dst: { bar: 0 } },
		],
		marks: {
			modify: [{
				foo: {
					gaps: [
						1,
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
						{ count: 1, stack: [{ type: "Forward", id: 1 }] },
					],
				},
				bar: {
					attach: [
						[
							{ type: "Move", id: 0, count: 0 },
							{ type: "Move", id: 1, count: 0 },
						],
					],
				},
			}],
		},
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		marks: {
			modify: [{
				foo: {
					attach: [
						2,
						[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
					],
				},
			}],
		},
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 2,
		marks: {
			modify: [{
				foo: {
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "X" }] }],
					],
				},
			}],
		},
	};

	export const e2_r_e1: S.Transaction = {
		ref: 0,
		seq: 2,
		newRef: 1,
		moves: [
			{ id: 0, src: { foo: 2 }, dst: { bar: 0 } },
		],
		marks: {
			modify: [{
				foo: {
					attach: [
						2,
						[{ type: "Bounce", id: 0 }],
					],
				},
				bar: {
					attach: [
						[
							{ type: "Intake", seq: 1, id: 0 },
							{ type: "Insert", id: 0, content: [{ id: "Y" }], src: { seq: 1, id: 1 } },
						],
					],
				},
			}],
		},
	};

	export const e3_r_e1: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 1,
		moves: [
			{ id: 0, src: { foo: 1 }, dst: { bar: 0 } },
		],
		marks: {
			modify: [{
				foo: {
					attach: [
						1,
						[{ type: "Bounce", id: 0 }],
					],
				},
				bar: {
					attach: [
						[
							{ type: "Insert", id: 0, content: [{ id: "X" }], src: { seq: 1, id: 0 } },
							{ type: "Intake", seq: 1, id: 1 },
						],
					],
				},
			}],
		},
	};

	export const e3_r_e2: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 2,
		moves: [
			{ id: 0, src: { foo: 1 }, dst: { bar: 0 } },
		],
		marks: {
			modify: [{
				foo: {
					attach: [
						1,
						[{ type: "Bounce", id: 0 }],
					],
				},
				bar: {
					attach: [
						[
							{ type: "Insert", id: 0, content: [{ id: "X" }], src: { seq: 1, id: 0 } },
							{ type: "Intake", seq: 1, id: 1 },
						],
					],
				},
			}],
		},
	};
}

/**
 * This scenario was originally meant to demonstrate that if an edit has tombstones that fall in the same cursor gap as
 * some move-in that it is being rebased over, then that edit must include the tombstones introduced by the extremities
 * of that move-in (if any).
 *
 * This scenario was predicated on the notion that inserts that commuted with a move would be solely represented by a
 * mark at the destination of the move, which forces the format to replicate tombstone information at the destination
 * site. Assuming such a design, if e5_r_e3 doesn't acquire the tombstones for AB when rebasing e5_r_e2 over e3_r_e2,
 * then when rebasing e5_r_e3 over e4_r_e3, we will not know how to order the tombstones for AB and V in
 * e5_r_e4, which means we will not know how to order X and Y.
 *
 * This design is no longer in effect so the need for such tombstones is moot.
 *
 * Starting state foo[A B] bar=[U V]
 * E1: U1: set-delete V
 * E2: U2: set-delete A B
 * E3: U1: slice-move [A B] after U
 * E4: U3: insert X after A (commute:all)
 * E5: U4: insert Y after V
 *
 * Expected outcome: foo=[] bar=[U X Y]
 */
export namespace ScenarioO {
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		marks: {
			modify: [{
				bar: {
					nodes: [
						1,
						{ type: "Delete", id: 0, count: 1 },
					],
				},
			}],
		},
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Delete", id: 0, count: 2 },
					],
				},
			}],
		},
	};

	export const e3: S.Transaction = {
		ref: 1, // Known of 1
		seq: 3,
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Move", id: 0, count: 2 },
					],
					gaps: [
						1,
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				bar: {
					attach: [
						1,
						[{ type: "Move", id: 0, count: 2, tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e4: S.Transaction = {
		ref: 0,
		seq: 4,
		marks: {
			modify: [{
				foo: {
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "X" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e5: S.Transaction = {
		ref: 0,
		seq: 5,
		marks: {
			modify: [{
				bar: {
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "Y" }] }],
					],
				},
			}],
		},
	};

	export const e2_r_e1: S.Transaction = {
		ref: 0,
		seq: 2,
		newRef: 1,
		marks: {
			modify: [{
				foo: {
					nodes: [
						{ type: "Delete", id: 0, count: 2 },
					],
				},
			}],
		},
	};

	export const e3_r_e2: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 2,
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 2 }],
					nodes: [
						{ type: "Move", id: 0, count: 2 },
					],
					gaps: [
						1,
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				bar: {
					attach: [
						1,
						[{ type: "Move", id: 0, count: 0, /* Updated */ tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e4_r_e1: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 1,
		marks: {
			modify: [{
				foo: {
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "X" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e4_r_e2: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 2,
		marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 2 }],
					attach: [
						1,
						[{ type: "Insert", id: 0, content: [{ id: "X" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e4_r_e3: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 3,
		moves: [{ id: 0, src: { foo: 0 }, dst: { bar: 2 } }],
			marks: {
			modify: [{
				foo: {
					tombs: [{ count: 2, seq: 2 }],
					attach: [
						1,
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Left }],
					],
				},
				bar: {
					attach: [
						1, // [-U
						[{ type: "Insert", id: 0, content: [{ id: "X" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e5_r_e1: S.Transaction = {
		ref: 0,
		seq: 5,
		newRef: 1,
		marks: {
			modify: [{
				bar: {
					tombs: [1, { count: 1, seq: 1 }],
					attach: [
						2,
						[{ type: "Insert", id: 0, content: [{ id: "Y" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e5_r_e2: S.Transaction = {
		ref: 0,
		seq: 5,
		newRef: 2,
		marks: {
			modify: [{
				bar: {
					tombs: [1, { count: 1, seq: 1 }],
					attach: [
						2,
						[{ type: "Insert", id: 0, content: [{ id: "Y" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e5_r_e3: S.Transaction = {
		ref: 0,
		seq: 5,
		newRef: 3,
		marks: {
			modify: [{
				bar: {
					tombs: [
						1,
						{ count: 1, seq: 1 }, // V
					],
					attach: [
						2, // [-U-V
						[{ type: "Insert", id: 0, content: [{ id: "Y" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e5_r_e4: S.Transaction = {
		ref: 0,
		seq: 5,
		newRef: 4,
		marks: {
			modify: [{
				bar: {
					tombs: [
						2, // U X
						{ count: 1, seq: 1 }, // V
					],
					attach: [
						3, // [-U-X-V
						[{ type: "Insert", id: 0, content: [{ id: "Y" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};
}

/**
 * This scenario demonstrates the need to keep information about the tie-braking of the slice-move
 * when rebasing an insert over such a move.
 *
 * Without this information, the tie-break information for the second insert will be used, which
 * in this example leads to the wrong outcome (foo=[Y X]).
 *
 * Starting state: foo=[], bar=[], baz=[]
 * U1: slice-move all of bar to the start of foo (Tiebreak: Left)
 * U2: slice-move all of baz to the end of foo (Tiebreak: Right)
 * U3: insert X in bar (Tiebreak: Left)
 * U4: insert Y in baz (Tiebreak: Left)
 * Expected outcome: foo=[X Y]
 */
export namespace ScenarioP {
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		moves: [{ id: 0, src: { bar: 0 }, dst: { foo: 0 } }],
			marks: {
			modify: [{
				bar: {
					gaps: [
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				foo: {
					attach: [
						[{ type: "Move", id: 0, count: 0, tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		moves: [{ id: 0, src: { baz: 0 }, dst: { foo: 0 } }],
			marks: {
			modify: [{
				baz: {
					gaps: [
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				foo: {
					attach: [
						[{ type: "Move", id: 0, count: 0, tiebreak: Tiebreak.Right }],
					],
				},
			}],
		},
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		marks: {
			modify: [{
				bar: {
					attach: [
						[{ type: "Insert", id: 0, content: [{ id: "X" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e4: S.Transaction = {
		ref: 0,
		seq: 4,
		marks: {
			modify: [{
				baz: {
					attach: [
						[{ type: "Insert", id: 0, content: [{ id: "Y" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e2_r_e1: S.Transaction = {
		ref: 0,
		seq: 2,
		newRef: 1,
		moves: [{ id: 0, src: { baz: 0 }, dst: { foo: 0 } }],
			marks: {
			modify: [{
				baz: {
					gaps: [
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				foo: {
					attach: [
						[{ type: "Move", id: 0, count: 0, tiebreak: Tiebreak.Right }],
					],
				},
			}],
		},
	};

	export const e3_r_e1: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 1,
		moves: [{ id: 0, src: { bar: 0 }, dst: { foo: 0 } }],
			marks: {
			modify: [{
				bar: {
					attach: [
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Left }], // Original Tiebreak
					],
				},
				foo: {
					attach: [
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "X" }],
							src: { seq: 1, id: 0 },
							tiebreak: Tiebreak.Left, // Move Tiebreak
						}],
					],
				},
			}],
		},
	};

	export const e3_r_e2: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 2,
		moves: [{ id: 0, src: { bar: 0 }, dst: { foo: 0 } }],
			marks: {
			modify: [{
				bar: {
					attach: [
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Left }], // Original Tiebreak
					],
				},
				foo: {
					attach: [
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "X" }],
							src: { seq: 1, id: 0 },
							tiebreak: Tiebreak.Left, // Move Tiebreak
						}],
					],
				},
			}],
		},
	};

	export const e4_r_e1: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 1,
		marks: {
			modify: [{
				baz: {
					attach: [
						[{ type: "Insert", id: 0, content: [{ id: "Y" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e4_r_e2: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 2,
		moves: [{ id: 0, src: { baz: 0 }, dst: { foo: 0 } }],
			marks: {
			modify: [{
				baz: {
					attach: [
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Left }], // Original Tiebreak
					],
				},
				foo: {
					attach: [
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "Y" }],
							src: { seq: 2, id: 0 },
							tiebreak: Tiebreak.Right, // Move Tiebreak
						}],
					],
				},
			}],
		},
	};

	export const e4_r_e3: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 3,
		moves: [{ id: 0, src: { baz: 0 }, dst: { foo: 0 } }],
			marks: {
			modify: [{
				baz: {
					attach: [
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Left }], // Original Tiebreak
					],
				},
				foo: {
					attach: [
						1, // [-X
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "Y" }],
							src: { seq: 2, id: 0 },
							tiebreak: Tiebreak.Right, // Move Tiebreak
						}],
					],
				},
			}],
		},
	};
}

/**
 * This scenario demonstrates the need to keep information about the tie-braking if the slice-move
 * when rebasing an insert over such a move, even when that insert is then rebased over another
 * slice-move (meaning it is not sufficient to keep information about the last slice-move that
 * affects a given insert).
 *
 * Without this information, the tie-break information for the second insert will be used, which
 * in this example leads to the wrong outcome (qux=[Y X]). This is true even if we record the
 * tie-breaking information for the last move.
 *
 * Starting state: foo=[], bar=[], baz=[]
 * U1: slice-move all of bar to the start of foo (Tiebreak: Left)
 * U2: slice-move all of baz to the end of foo (Tiebreak: Right)
 * U3: slice-move all of foo to the end of qux
 * U4: insert X in bar (Tiebreak: Left)
 * U5: insert Y in baz (Tiebreak: Left)
 * Expected outcome: qux=[X Y]
 */
export namespace ScenarioQ {
	export const e1: S.Transaction = {
		ref: 0,
		seq: 1,
		moves: [{ id: 0, src: { bar: 0 }, dst: { foo: 0 } }],
			marks: {
			modify: [{
				bar: {
					gaps: [
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				foo: {
					attach: [
						[{ type: "Move", id: 0, count: 0, tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e2: S.Transaction = {
		ref: 0,
		seq: 2,
		moves: [{ id: 0, src: { baz: 0 }, dst: { foo: 0 } }],
			marks: {
			modify: [{
				baz: {
					gaps: [
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				foo: {
					attach: [
						[{ type: "Move", id: 0, count: 0, tiebreak: Tiebreak.Right }],
					],
				},
			}],
		},
	};

	export const e3: S.Transaction = {
		ref: 0,
		seq: 3,
		moves: [{ id: 0, src: { foo: 0 }, dst: { qux: 0 } }],
			marks: {
			modify: [{
				foo: {
					gaps: [
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				qux: {
					attach: [
						[{ type: "Move", id: 0, count: 0, tiebreak: Tiebreak.Right }],
					],
				},
			}],
		},
	};

	export const e4: S.Transaction = {
		ref: 0,
		seq: 4,
		marks: {
			modify: [{
				bar: {
					attach: [
						[{ type: "Insert", id: 0, content: [{ id: "X" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e5: S.Transaction = {
		ref: 0,
		seq: 5,
		marks: {
			modify: [{
				baz: {
					attach: [
						[{ type: "Insert", id: 0, content: [{ id: "Y" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e2_r_e1: S.Transaction = {
		ref: 0,
		seq: 2,
		newRef: 1,
		moves: [{ id: 0, src: { baz: 0 }, dst: { foo: 0 } }],
			marks: {
			modify: [{
				baz: {
					gaps: [
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				foo: {
					attach: [
						[{ type: "Move", id: 0, count: 0, tiebreak: Tiebreak.Right }],
					],
				},
			}],
		},
	};

	export const e3_r_e1: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 1,
		moves: [{ id: 0, src: { foo: 0 }, dst: { qux: 0 } }],
			marks: {
			modify: [{
				foo: {
					gaps: [
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				qux: {
					attach: [
						[{ type: "Move", id: 0, count: 0, tiebreak: Tiebreak.Right }],
					],
				},
			}],
		},
	};

	export const e3_r_e2: S.Transaction = {
		ref: 0,
		seq: 3,
		newRef: 2,
		moves: [{ id: 0, src: { foo: 0 }, dst: { qux: 0 } }],
			marks: {
			modify: [{
				foo: {
					gaps: [
						{ count: 1, stack: [{ type: "Forward", id: 0 }] },
					],
				},
				qux: {
					attach: [
						[{ type: "Move", id: 0, count: 0, tiebreak: Tiebreak.Right }],
					],
				},
			}],
		},
	};

	export const e4_r_e1: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 1,
		moves: [{ id: 0, src: { bar: 0 }, dst: { foo: 0 } }],
			marks: {
			modify: [{
				bar: {
					attach: [
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Left }], // Original Tiebreak
					],
				},
				foo: {
					attach: [
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "X" }],
							src: { seq: 1, id: 0 },
							tiebreak: Tiebreak.Left, // Move Tiebreak
						}],
					],
				},
			}],
		},
	};

	export const e4_r_e2: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 2,
		moves: [{ id: 0, src: { bar: 0 }, dst: { foo: 0 } }],
			marks: {
			modify: [{
				bar: {
					attach: [
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Left }], // Original Tiebreak
					],
				},
				foo: {
					attach: [
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "X" }],
							src: { seq: 1, id: 0 },
							tiebreak: Tiebreak.Left, // Move Tiebreak
						}],
					],
				},
			}],
		},
	};

	export const e4_r_e3: S.Transaction = {
		ref: 0,
		seq: 4,
		newRef: 3,
		moves: [{ id: 0, src: { bar: 0 }, hops: [{ foo: 0 }], dst: { qux: 0 } }],
			marks: {
			modify: [{
				bar: {
					attach: [
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Left }], // Original Tiebreak
					],
				},
				foo: {
					attach: [
						[{
							type: "Bounce",
							id: 0,
							src: { seq: 1, id: 0 },
							tiebreak: Tiebreak.Left, // Move Tiebreak
						}],
					],
				},
				qux: {
					attach: [
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "X" }],
							src: { seq: 3, id: 0 },
							tiebreak: Tiebreak.Right, // Move Tiebreak
						}],
					],
				},
			}],
		},
	};

	export const e5_r_e1: S.Transaction = {
		ref: 0,
		seq: 5,
		newRef: 1,
		marks: {
			modify: [{
				baz: {
					attach: [
						[{ type: "Insert", id: 0, content: [{ id: "Y" }], tiebreak: Tiebreak.Left }],
					],
				},
			}],
		},
	};

	export const e5_r_e2: S.Transaction = {
		ref: 0,
		seq: 5,
		newRef: 2,
		moves: [{ id: 0, src: { baz: 0 }, dst: { foo: 0 } }],
			marks: {
			modify: [{
				baz: {
					attach: [
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Left }], // Original Tiebreak
					],
				},
				foo: {
					attach: [
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "Y" }],
							src: { seq: 2, id: 0 },
							tiebreak: Tiebreak.Right, // Move Tiebreak
						}],
					],
				},
			}],
		},
	};

	export const e5_r_e3: S.Transaction = {
		ref: 0,
		seq: 5,
		newRef: 3,
		moves: [{ id: 0, src: { baz: 0 }, hops: [{ foo: 0 }], dst: { qux: 0 } }],
			marks: {
			modify: [{
				baz: {
					attach: [
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Left }], // Original Tiebreak
					],
				},
				foo: {
					attach: [
						[{
							type: "Bounce",
							id: 0,
							src: { seq: 2, id: 0 },
							tiebreak: Tiebreak.Right, // Move Tiebreak
						}],
					],
				},
				qux: {
					attach: [
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "Y" }],
							src: { seq: 3, id: 0 },
							tiebreak: Tiebreak.Right, // Move Tiebreak
						}],
					],
				},
			}],
		},
	};

	export const e5_r_e4: S.Transaction = {
		ref: 0,
		seq: 5,
		newRef: 4,
		moves: [{ id: 0, src: { baz: 0 }, hops: [{ foo: 0 }], dst: { qux: 0 } }],
			marks: {
			modify: [{
				baz: {
					attach: [
						[{ type: "Bounce", id: 0, tiebreak: Tiebreak.Left }], // Original Tiebreak
					],
				},
				foo: {
					attach: [
						[{
							type: "Bounce",
							id: 0,
							src: { seq: 2, id: 0 },
							tiebreak: Tiebreak.Right, // Move Tiebreak
						}],
					],
				},
				qux: {
					attach: [
						1, // [-X
						[{
							type: "Insert",
							id: 0,
							content: [{ id: "Y" }],
							src: { seq: 3, id: 0 },
							tiebreak: Tiebreak.Right, // Move Tiebreak
						}],
					],
				},
			}],
		},
	};
}

export const allOriginals = [
	...ScenarioA.originals,
	...ScenarioF.originals,
	...ScenarioG.originals,
];
