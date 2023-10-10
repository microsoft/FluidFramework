export interface Revertible {
	readonly kind: RevertibleKind;
	readonly origin: {
		readonly isLocal: boolean;

		readonly view: ISharedTreeView;
	};
	revert(): RevertResult;
	discard(): DiscardResult;
}

/**
 * The type of revertible commit.
 *
 * @alpha
 */
export enum RevertibleKind {
	/** A typical local commit */
	Default,
	/** A commit that is the result of an undo. */
	Undo,
	/** A commit that is the result of a redo. */
	Redo,
}

/**
 * The result of a revert operation.
 *
 * @alpha
 */
export enum RevertResult {
	Success,
	Failure,
}
