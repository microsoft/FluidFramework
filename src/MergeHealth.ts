/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from '@fluidframework/common-definitions';
import { assertNotUndefined, fail, Result } from './Common';
import {
	PlaceAnchorSemanticsChoice,
	PlaceUpdateFailureKind,
	RangeUpdateFailureKind,
	resolvePlaceAnchor,
	resolveRangeAnchor,
} from './anchored-edits';
import { PlaceValidationResult, RangeValidationResultKind, SharedTree, Transaction } from './default-edits';
import { EditStatus, GenericSharedTree, SequencedEditAppliedEventArguments, SharedTreeEvent } from './generic';

/**
 * Logs generic telemetry for failed sequenced edits.
 * Only failing edits that were originally made locally are logged.
 * @param tree - The tree for which to log the telemetry.
 */
export function useFailedSequencedEditTelemetry<TSharedTree extends GenericSharedTree<any, any>>(
	tree: TSharedTree
): { disable: () => void } {
	function onEdit({ wasLocal, logger, outcome }: SequencedEditAppliedEventArguments<TSharedTree>): void {
		if (wasLocal && outcome.status !== EditStatus.Applied) {
			logger.send({
				category: 'generic',
				eventName:
					outcome.status === EditStatus.Malformed ? 'MalformedSharedTreeEdit' : 'InvalidSharedTreeEdit',
			});
		}
	}
	tree.on(SharedTreeEvent.SequencedEditApplied, onEdit);
	return {
		disable: () => {
			tree.off(SharedTreeEvent.SequencedEditApplied, onEdit);
		},
	};
}

/**
 * Statistics about the health of collaborative edit merging when using {@link SharedTree}.
 * All of those numbers constitute a tally since the last heartbeat was logged or cleared.
 */
export interface MergeHealthStats {
	/** Number of sequenced edits applied (failed or not). */
	editCount: number;

	/**
	 * Number of sequenced edits that failed to apply.
	 * Such cases are also counted under {@link MergeHealthStats.editCount}.
	 *
	 * If this number is greater than the sum of:
	 * * {@link MergeHealthStats.badPlaceCount}
	 * * {@link MergeHealthStats.badRangeCount}
	 * * {@link MergeHealthStats.constraintViolationCount}
	 * * {@link MergeHealthStats.idAlreadyInUseCount}
	 * * {@link MergeHealthStats.unknownIdCount}
	 * * {@link MergeHealthStats.malformedEditCount}
	 *
	 * then some failure scenarios are not being tracked adequately.
	 */
	failedEditCount: number;

	/**
	 * Number of sequenced edits that failed to apply due to a bad place.
	 * Such cases are also counted under {@link MergeHealthStats.failedEditCount}.
	 *
	 * If this number is greater than the sum of:
	 * * {@link MergeHealthStats.deletedAncestorBadPlaceCount}
	 * * {@link MergeHealthStats.deletedSiblingBadPlaceCount}
	 *
	 * then some failure scenarios are not being tracked adequately.
	 */
	badPlaceCount: number;

	/**
	 * Number of sequenced edits that failed to apply due to a bad range.
	 * Such cases are also counted under {@link MergeHealthStats.failedEditCount}.
	 *
	 * If this number is greater than the sum of:
	 * * {@link MergeHealthStats.deletedAncestorBadRangeCount}
	 * * {@link MergeHealthStats.deletedSiblingBadRangeCount}
	 * * {@link MergeHealthStats.updatedRangeInvertedCount}
	 * * {@link MergeHealthStats.updatedRangeHasPlacesInDifferentTraitsCount}
	 *
	 * then some failure scenarios are not being tracked adequately.
	 */
	badRangeCount: number;

	/**
	 * Number of sequenced edits that failed to apply due to a place whose ancestors had been concurrently deleted.
	 * Such cases are also counted under {@link MergeHealthStats.badPlaceCount}.
	 */
	deletedAncestorBadPlaceCount: number;

	/**
	 * Number of sequenced edits that failed to apply due to a range whose ancestors had been concurrently deleted.
	 * Such cases are also counted under {@link MergeHealthStats.badRangeCount}.
	 */
	deletedAncestorBadRangeCount: number;

	/**
	 * Number of sequenced edits that failed to apply due to a place whose sibling (but not its parent) had been concurrently deleted.
	 * Such cases are also counted under {@link MergeHealthStats.badPlaceCount}.
	 */
	deletedSiblingBadPlaceCount: number;

	/**
	 * Number of sequenced edits that failed to apply due to a range whose delimiting sibling(s) (but not its parent) had been concurrently
	 * deleted.
	 * Such cases are also counted under {@link MergeHealthStats.badRangeCount}.
	 */
	deletedSiblingBadRangeCount: number;

	/**
	 * Number of sequenced edits that failed to apply due to a range whose places were resolvable but inverted (i.e., end before start).
	 * Such cases are also counted under {@link MergeHealthStats.badRangeCount}.
	 */
	updatedRangeInvertedCount: number;

	/**
	 * Number of sequenced edits that failed to apply due to a range whose places were resolvable but in different traits.
	 * Such cases are also counted under {@link MergeHealthStats.badRangeCount}.
	 */
	updatedRangeHasPlacesInDifferentTraitsCount: number;

	/**
	 * Number of sequenced edits that failed to apply due to a constraint violation.
	 * Such cases are also counted under {@link MergeHealthStats.failedEditCount}.
	 *
	 * If this number is greater than the sum of:
	 * * {@link MergeHealthStats.rangeConstraintViolationCount}
	 * * {@link MergeHealthStats.lengthConstraintViolationCount}
	 * * {@link MergeHealthStats.parentConstraintViolationCount}
	 * * {@link MergeHealthStats.labelConstraintViolationCount}
	 *
	 * then some failure scenarios are not being tracked adequately.
	 */
	constraintViolationCount: number;

	/**
	 * Number of sequenced edits that failed to apply due to a constrained range becoming invalid or malformed.
	 * Such cases are also counted under {@link MergeHealthStats.constraintViolationCount}.
	 */
	rangeConstraintViolationCount: number;

	/**
	 * Number of sequenced edits that failed to apply due to a constrained range having a different length.
	 * Such cases are also counted under {@link MergeHealthStats.constraintViolationCount}.
	 */
	lengthConstraintViolationCount: number;

	/**
	 * Number of sequenced edits that failed to apply due to a constrained range being under a different parent.
	 * Such cases are also counted under {@link MergeHealthStats.constraintViolationCount}.
	 */
	parentConstraintViolationCount: number;

	/**
	 * Number of sequenced edits that failed to apply due to a constrained range being under a different label.
	 * Such cases are also counted under {@link MergeHealthStats.constraintViolationCount}.
	 */
	labelConstraintViolationCount: number;

	/**
	 * Number of sequenced edits that failed to apply due to an ID collision.
	 * Such cases are also counted under {@link MergeHealthStats.failedEditCount}.
	 */
	idAlreadyInUseCount: number;

	/**
	 * Number of sequenced edits that failed to apply due to an ID being unknown.
	 * Such cases are also counted under {@link MergeHealthStats.failedEditCount}.
	 */
	unknownIdCount: number;

	/**
	 * Number of sequenced edits that failed to apply due to an edit becoming malformed.
	 * This should theoretically never happen.
	 * Such cases are also counted under {@link MergeHealthStats.failedEditCount}.
	 */
	malformedEditCount: number;

	/**
	 * The counts of occurrences for a given path length. `pathLengths[1] === 2` means two occurrences of length one.
	 */
	pathLengths: number[];

	/** The highest number previous attempts on a sequenced edit. */
	maxAttemptCount: number;
}

/**
 * Aggregates and logs telemetry about the success of concurrent edits.
 */
export class SharedTreeMergeHealthTelemetryHeartbeat {
	private heartbeatTimerId = 0;
	private readonly treeData = new Map<SharedTree, { tally: MergeHealthStats; logger?: ITelemetryLogger }>();

	/**
	 * Adds a tree to the set of tree to log merge health telemetry for.
	 * Noop if such a tree was already in the set.
	 * @param tree - The tree to log merge health telemetry for.
	 */
	public attachTree(tree: SharedTree) {
		if (this.treeData.has(tree) === false) {
			this.resetTreeData(tree);
			tree.on(SharedTreeEvent.SequencedEditApplied, this.sequencedEditHandler);
		}
	}

	/**
	 * Removes a tree from the set of tree to log merge health telemetry for.
	 * Noop if such a tree was never in the set.
	 * @param tree - The tree to stop logging merge health telemetry for.
	 */
	public detachTree(tree: SharedTree) {
		if (this.treeData.has(tree)) {
			tree.off(SharedTreeEvent.SequencedEditApplied, this.sequencedEditHandler);
			this.treeData.delete(tree);
		}
	}

	/**
	 * Exposes the aggregated statistics about merge health for the given tree.
	 * @param tree - The tree to get stats for.
	 * @returns Aggregated statistics about merge health for the given tree.
	 */
	public getStats(tree: SharedTree): MergeHealthStats {
		return assertNotUndefined(this.treeData.get(tree), 'No such tree was attached to the logger').tally;
	}

	/**
	 * Removes all trees from the set of tree to log merge health telemetry for.
	 */
	public detachAllTrees() {
		for (const tree of this.treeData.keys()) {
			this.detachTree(tree);
		}
	}

	/**
	 * Resets the aggregated merge health data for the given tree.
	 * @param tree - The tree to reset the merge health data for.
	 */
	public resetTreeData(tree: SharedTree): void {
		this.treeData.set(tree, {
			tally: {
				maxAttemptCount: 0,
				pathLengths: [],
				editCount: 0,
				failedEditCount: 0,
				badPlaceCount: 0,
				badRangeCount: 0,

				deletedAncestorBadPlaceCount: 0,
				deletedAncestorBadRangeCount: 0,

				deletedSiblingBadPlaceCount: 0,
				deletedSiblingBadRangeCount: 0,
				updatedRangeInvertedCount: 0,
				updatedRangeHasPlacesInDifferentTraitsCount: 0,

				constraintViolationCount: 0,
				rangeConstraintViolationCount: 0,
				lengthConstraintViolationCount: 0,
				parentConstraintViolationCount: 0,
				labelConstraintViolationCount: 0,

				idAlreadyInUseCount: 0,
				unknownIdCount: 0,
				malformedEditCount: 0,
			},
		});
	}

	/**
	 * Enables the regular telemetry logging of merge health data.
	 * The first message will be sent after `interval` milliseconds. See {@link SharedTreeMergeHealthTelemetryHeartbeat.flushHeartbeat} for
	 * immediate logging.
	 * @param interval - The amount of time in milliseconds between log messages.
	 */
	public startHeartbeat(interval: number = 60000): void {
		if (this.heartbeatTimerId !== 0) {
			this.stopHeartbeat();
		}
		this.heartbeatTimerId = window.setInterval(this.logHeartbeat, interval);
	}

	/**
	 * Disables the regular telemetry logging of merge health data.
	 */
	public stopHeartbeat(): void {
		window.clearInterval(this.heartbeatTimerId);
		this.heartbeatTimerId = 0;
	}

	/**
	 * Sends all collected merge health data and resets the aggregated state.
	 */
	public flushHeartbeat(): void {
		this.logHeartbeat();
		this.clearData();
	}

	/**
	 * Resets all aggregated state.
	 */
	public clearData(): void {
		for (const tree of this.treeData.keys()) {
			this.resetTreeData(tree);
		}
	}

	/**
	 * Receives SequencedEditApplied events from trees.
	 */
	private readonly sequencedEditHandler = (params: SequencedEditAppliedEventArguments<SharedTree>) => {
		const { edit, tree, wasLocal, logger, outcome, reconciliationPath } = params;
		if (wasLocal) {
			const tallyAndLogger = this.treeData.get(tree) ?? fail('Should only receive events for registered trees');
			tallyAndLogger.logger = logger;
			const tally = tallyAndLogger.tally;
			tally.editCount += 1;
			tally.pathLengths[reconciliationPath.length] = (tally.pathLengths[reconciliationPath.length] ?? 0) + 1;
			if (edit.pastAttemptCount !== undefined && edit.pastAttemptCount > tally.maxAttemptCount) {
				tally.maxAttemptCount = edit.pastAttemptCount;
			}
			if (outcome.status !== EditStatus.Applied) {
				tally.failedEditCount += 1;
				switch (outcome.failure.kind) {
					case Transaction.FailureKind.BadPlace: {
						tally.badPlaceCount += 1;
						if (outcome.failure.placeFailure === PlaceValidationResult.MissingSibling) {
							const result = resolvePlaceAnchor(
								{ ...outcome.failure.place, semantics: PlaceAnchorSemanticsChoice.RelativeToNode },
								tree.currentView,
								reconciliationPath
							);
							if (Result.isOk(result)) {
								tally.deletedSiblingBadPlaceCount += 1;
							} else if (result.error.placeFailure.kind === PlaceUpdateFailureKind.DeletedParent) {
								tally.deletedAncestorBadPlaceCount += 1;
							}
						} else if (outcome.failure.placeFailure === PlaceValidationResult.MissingParent) {
							tally.deletedAncestorBadPlaceCount += 1;
						}
						break;
					}
					case Transaction.FailureKind.BadRange: {
						tally.badRangeCount += 1;
						const range = outcome.failure.range;
						const result = resolveRangeAnchor(
							{
								start: { ...range.start, semantics: PlaceAnchorSemanticsChoice.RelativeToNode },
								end: { ...range.end, semantics: PlaceAnchorSemanticsChoice.RelativeToNode },
							},
							tree.currentView,
							reconciliationPath
						);
						if (Result.isOk(result)) {
							tally.deletedSiblingBadRangeCount += 1;
						} else if (
							result.error.rangeFailure.kind === RangeUpdateFailureKind.ResolvedPlacesMakeBadRange
						) {
							const failure = result.error.rangeFailure.rangeFailure;
							if (failure === RangeValidationResultKind.Inverted) {
								tally.updatedRangeInvertedCount += 1;
							} else if (failure === RangeValidationResultKind.PlacesInDifferentTraits) {
								tally.updatedRangeHasPlacesInDifferentTraitsCount += 1;
							}
						} else if (
							result.error.rangeFailure.placeFailure.kind === PlaceUpdateFailureKind.DeletedParent
						) {
							tally.deletedAncestorBadRangeCount += 1;
						}
						break;
					}
					case Transaction.FailureKind.ConstraintViolation: {
						tally.constraintViolationCount += 1;
						switch (outcome.failure.violation.kind) {
							case Transaction.ConstraintViolationKind.BadRange: {
								tally.rangeConstraintViolationCount += 1;
								const result = resolveRangeAnchor(
									outcome.failure.constraint.toConstrain,
									tree.currentView,
									reconciliationPath
								);
								if (Result.isOk(result)) {
									tally.deletedSiblingBadRangeCount += 1;
								} else if (
									result.error.rangeFailure.kind === RangeUpdateFailureKind.ResolvedPlacesMakeBadRange
								) {
									tally.updatedRangeInvertedCount += 1;
								} else if (
									result.error.rangeFailure.placeFailure.kind === PlaceUpdateFailureKind.DeletedParent
								) {
									tally.deletedAncestorBadRangeCount += 1;
								}
								break;
							}
							case Transaction.ConstraintViolationKind.BadLength: {
								tally.lengthConstraintViolationCount += 1;
								break;
							}
							case Transaction.ConstraintViolationKind.BadParent: {
								tally.parentConstraintViolationCount += 1;
								break;
							}
							case Transaction.ConstraintViolationKind.BadLabel: {
								tally.labelConstraintViolationCount += 1;
								break;
							}
							default: {
								// If this doesn't type-check, the above switch statement needs to be extended to handle a new case.
								const _: never = outcome.failure.violation;
							}
						}
						break;
					}
					case Transaction.FailureKind.IdAlreadyInUse: {
						tally.idAlreadyInUseCount += 1;
						break;
					}
					case Transaction.FailureKind.UnknownId: {
						tally.unknownIdCount += 1;
						break;
					}
					case Transaction.FailureKind.DetachedSequenceIdAlreadyInUse:
					case Transaction.FailureKind.DetachedSequenceNotFound:
					case Transaction.FailureKind.DuplicateIdInBuild:
					case Transaction.FailureKind.UnusedDetachedSequence: {
						tally.malformedEditCount += 1;
						break;
					}
					default: {
						// If this doesn't type-check, the above switch statement needs to be extended to handle a new case.
						const _: never = outcome.failure;
					}
				}
			}
		}
	};

	/**
	 * Logs the accumulated merge health data to each tree's designated logger.
	 */
	private readonly logHeartbeat = () => {
		for (const [tree, { tally, logger }] of this.treeData) {
			if (logger && tally.editCount > 0) {
				// Note: all this data is for sequenced edits that were originally produced by the local client.
				logger.send({
					category: 'Heartbeat',
					eventName: 'EditMergeHealth',
					...tally,
					// The counts of occurrences for a given path length.
					// '1:2' means two occurrences of length one.
					// Overwrites `tally.pathLengths` which is incompatible with ITelemetryBaseEvent.
					pathLengths: pathLengthsCounts(tally.pathLengths),
				});
				this.resetTreeData(tree);
			}
		}
	};
}

function pathLengthsCounts(lengths: readonly number[]): string {
	return Object.entries(lengths)
		.map(([length, count]) => `${length}:${count}`)
		.join(',');
}
