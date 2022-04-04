export const t_u2_rebased: ChangeFrame = {
	modify: {
		foo: [
			1,
			{
				type: "squashSkipMetainfo",
				additionalSkips: [
					{
						seq: 1, // I don't think we should use numeric sequences, since there might be branches that
								// complicate this, but I'll stick to this, because they are used elsewhere in the doc
						additionalSkip: 1
					}
				]
			}, // Skip A (and when squashing with previous commit also the deleted B)
			{ type: "MoveOutStart", side: Sibling.Next, dstPath: { bar: 0 } },
			// Do we need this additional skip for C, or is this redundant at this point, since we could just keep the
			// remaining delete?
			{
				type: "squashSkipMetainfo",
				additionalSkips: [
					{
						seq: 1,
						additionalSkip: 1
					}
				]
			},
			1, // Skip D
			{ type: "End" },
		],
		bar: [
			{ type: "MoveIn", srcPath: { foo: 2 }, length: 2 },
		],
	},
};