/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeRebaser } from ".";

export type Passed = "Passed";

export interface Error<TChange> {
    changes: [TChange, TChange, TChange] | [TChange, TChange] | TChange;
    error: string;
}

export interface OutputType<TChange> {
    /**
     * "Passed" iff `(A ○ B) ○ C = A (B ○ C) = A ○ B ○ C`,
     * otherwise a triple that violates the axiom.
     */
    composeAssociativity: Passed | Error<TChange>[];
    /**
     * "Passed" iff `A ↷ (B ○ C) = (A ↷ B) ↷ C`,
     * otherwise a triple that violates the axiom.
     */
    rebaseLeftDistributivity: Passed | Error<TChange>[];
    /**
     * "Passed" iff `(A ○ B) ↷ C = (A ↷ C) ○ (B ↷ (A⁻¹ ○ C ○ (A ↷ C)) ↷ C)`,
     * otherwise a triple that violates the axiom.
     */
    rebaseRightDistributivity: Passed | Error<TChange>[];
    /**
     * "Passed" iff `(A ↷ B) ↷ B⁻¹ = A`,
     * otherwise a pair that violates the axiom.
     */
    rebaseOverDoUndoPairIsNoOp: Passed | Error<TChange>[];
    /**
     * "Passed" iff `((A ↷ B) ↷ B⁻¹) ↷ B = A ↷ B`,
     * otherwise a pair that violates the axiom.
     */
    rebaseOverUndoRedoPairIsNoOp: Passed | Error<TChange>[];
    /**
     * "Passed" iff `A ○ A⁻¹ = ε` where `ε` is the empty change,
     * otherwise a change that violates the axiom.
     */
    composeWithInverseIsNoOp: Passed | Error<TChange>[];
    /**
     * "Passed" iff `A ○ ε` is equal to `ε ○ A` which equals to `A` where `ε` is the empty change,
     * otherwise a change that violates the axiom.
     */
    composeWithEmptyIsNoOp: Passed | Error<TChange>[];
     /**
     * "Passed" iff `(A ↷ ε) = A`,
     * otherwise a change that violates the axiom.
     */
    rebaseOverEmptyIsNoOp: Passed | Error<TChange>[];
    /**
     * "Passed" iff `(ε ↷ A) = ε`,
     * otherwise a change that violates the axiom.
     */
    rebaseEmptyIsEmpty: Passed | Error<TChange>[];
     /**
     * "Passed" iff `ε⁻¹ = ε`,
     * otherwise a change that violates the axiom.
     */
    emptyInverseIsEmpty: Passed | Error<TChange>[];

}

/**
 * Verifies the axioms of `ChangeRebaser` are met by the given `rebaser`.
 * @param rebaser - The rebaser to test.
 * @param changes - The set of changes to use for testing the `rebaser`.
 * @param isEquivalent - Used to compare whether two changes are equivalent for the purposes of this axioms.
 */
export function verifyChangeRebaser<TChange>(
    rebaser: ChangeRebaser<TChange>,
    changes: ReadonlySet<TChange>,
    isEquivalent: (a: TChange, b: TChange) => boolean,
): OutputType<TChange> {
    const rebase = rebaser.rebase.bind(rebaser);
    const compose = rebaser.compose.bind(rebaser);
    const invert = rebaser.invert.bind(rebaser);

    const output: OutputType<TChange> = {
        rebaseLeftDistributivity: "Passed",
        rebaseRightDistributivity: "Passed",
        composeAssociativity: "Passed",
        rebaseOverDoUndoPairIsNoOp: "Passed",
        rebaseOverUndoRedoPairIsNoOp: "Passed",
        composeWithInverseIsNoOp: "Passed",
        composeWithEmptyIsNoOp: "Passed",
        rebaseOverEmptyIsNoOp: "Passed",
        rebaseEmptyIsEmpty: "Passed",
        emptyInverseIsEmpty: "Passed",
    };

    for (const changeA of changes) {
        const requirement1 = isComposeWithInverseEqualsEmpty(changeA);
        if (!requirement1) {
            if (output.composeWithInverseIsNoOp !== "Passed") {
                output.composeWithInverseIsNoOp.push(requirement1);
            } else {
                output.composeWithInverseIsNoOp = [requirement1];
            }
        }
        const requirement2 = isComposeWithEmptyNoOp(changeA);
        if (!requirement2) {
            if (output.composeWithEmptyIsNoOp !== "Passed") {
                output.composeWithEmptyIsNoOp.push(requirement2);
            } else {
                output.composeWithEmptyIsNoOp = [requirement2];
            }
        }
        const requirement3 = isRebaseOverEmptyNoOp(changeA);
        if (!requirement3) {
            if (output.rebaseOverEmptyIsNoOp !== "Passed") {
                output.rebaseOverEmptyIsNoOp.push(requirement3);
            } else {
                output.rebaseOverEmptyIsNoOp = [requirement3];
            }
        }
        const requirement4 = isRebaseEmptyEmpty(changeA);
        if (!requirement4) {
            if (output.rebaseEmptyIsEmpty !== "Passed") {
                output.rebaseEmptyIsEmpty.push(requirement4);
            } else {
                output.rebaseEmptyIsEmpty = [requirement4];
            }
        }
        const requirement5 = isEmptyInverseEmpty(changeA);
        if (!requirement5) {
            if (output.emptyInverseIsEmpty !== "Passed") {
                output.emptyInverseIsEmpty.push(requirement5);
            } else {
                output.emptyInverseIsEmpty = [requirement5];
            }
        }
        for (const changeB of changes) {
            const requirement6 = isRebaseOverDoUndoPairNoOp(changeA, changeB);
            if (!requirement6) {
                if (output.rebaseOverDoUndoPairIsNoOp !== "Passed") {
                    output.rebaseOverDoUndoPairIsNoOp.push(requirement6);
                } else {
                    output.rebaseOverDoUndoPairIsNoOp = [requirement6];
                }
            }
            const requirement7 = isRebaseOverUndoRedoPairNoOp(changeA, changeB);
            if (!requirement7) {
                if (output.rebaseOverUndoRedoPairIsNoOp !== "Passed") {
                    output.rebaseOverUndoRedoPairIsNoOp.push(requirement7);
                } else {
                    output.rebaseOverUndoRedoPairIsNoOp = [requirement7];
                }
            }
            for (const changeC of changes) {
                const requirement8 = isRebaseLeftDistributive(changeA, changeB, changeC);
                if (!requirement8) {
                    if (output.rebaseLeftDistributivity !== "Passed") {
                        output.rebaseLeftDistributivity.push(requirement8);
                    } else {
                        output.rebaseLeftDistributivity = [requirement8];
                    }
                }
                const requirement9 = isComposeAssociative(changeA, changeB, changeC);
                if (!requirement9) {
                    if (output.composeAssociativity !== "Passed") {
                        output.composeAssociativity.push(requirement9);
                    } else {
                        output.composeAssociativity = [requirement9];
                    }
                }
                const requirement10 = isRebaseRightDistributive(changeA, changeB, changeC);
                if (!requirement10) {
                    if (output.rebaseRightDistributivity !== "Passed") {
                        output.rebaseRightDistributivity.push(requirement10);
                    } else {
                        output.rebaseRightDistributivity = [requirement10];
                    }
                }
            }
        }
    }

    return output;

    // Requirement testing the rebasing of composed changes and rebased changes.
    function isRebaseLeftDistributive(changeA: TChange, changeB: TChange, changeC: TChange) {
        try {
            const rebaseChangeset1 = rebase(
                changeA,
                compose([changeB, changeC]),
            );
            const rebaseChangeset2 = rebase(
                rebase(changeA, changeB),
                changeC,
            );
            const reqFailure: Error<TChange> = {
                changes: [changeA, changeB, changeC],
                error: "requirement failure",
            };
            const equivalent = isEquivalent(rebaseChangeset1, rebaseChangeset2);
            return equivalent ? true : reqFailure;
        } catch (err) {
            return {
                changes: [changeA, changeB, changeC],
                error: JSON.stringify(err, Object.getOwnPropertyNames(err)),
            };
        }
    }

    // Requirement checking different ordering of composed changes
    function isComposeAssociative(changeA: TChange, changeB: TChange, changeC: TChange) {
        try {
            const changeset1 = compose([
                changeA,
                compose([changeB, changeC]),
            ]);
            const changeset2 = compose([
                compose([changeA, changeB]),
                changeC,
            ]);
            const changeset3 = compose([changeA, changeB, changeC]);
            const reqFailure: Error<TChange> = {
                changes: [changeA, changeB, changeC],
                error: "requirement failure",
            };
            const equivalent = isEquivalent(changeset1, changeset2) && isEquivalent(changeset1, changeset3);
            return equivalent ? true : reqFailure;
        } catch (err) {
            return {
                changes: [changeA, changeB, changeC],
                error: JSON.stringify(err, Object.getOwnPropertyNames(err)),
            };
        }
    }

    function isRebaseRightDistributive(changeA: TChange, changeB: TChange, changeC: TChange) {
        try {
            const changeset1 = rebase(
                compose([changeA, changeB]),
                changeC,
            );
            const changeset2 = compose([
                rebase(changeA, changeC),
                rebase(
                    changeB,
                    compose([
                        invert(changeA),
                        changeC,
                        rebase(changeA, changeC),
                    ]),
                ),
            ]);
            const reqFailure: Error<TChange> = {
                changes: [changeA, changeB, changeC],
                error: "requirement failure",
            };
            const equivalent = isEquivalent(changeset1, changeset2);
            return equivalent ? true : reqFailure;
        } catch (err) {
            return {
                changes: [changeA, changeB, changeC],
                error: JSON.stringify(err, Object.getOwnPropertyNames(err)),
            };
        }
    }

    // requirement for do-undo pair
    function isRebaseOverDoUndoPairNoOp(changeA: TChange, changeB: TChange) {
        try {
            const inv = invert(changeB);
            const r1 = rebase(changeA, changeB);
            const r2 = rebase(r1, inv);
            const equivalent = isEquivalent(r2, changeA);
            const reqFailure: Error<TChange> = {
                changes: [changeA, changeB],
                error: "requirement failure",
            };
            return equivalent ? true : reqFailure;
        } catch (err) {
            return {
                changes: [changeA, changeB],
                error: JSON.stringify(err, Object.getOwnPropertyNames(err)),
            };
        }
    }

    // requirement for sandwich rebasing
    function isRebaseOverUndoRedoPairNoOp(changeA: TChange, changeB: TChange) {
        try {
            const invB = invert(changeB);
            const r1 = rebase(changeA, changeB);
            const r2 = rebase(r1, invB);
            const r3 = rebase(r2, changeB);
            const reqFailure: Error<TChange> = {
                changes: [changeA, changeB],
                error: "requirement failure",
            };
            const equivalent = isEquivalent(r3, r1);
            return equivalent ? true : reqFailure;
        } catch (err) {
            return {
                changes: [changeA, changeB],
                error: JSON.stringify(err, Object.getOwnPropertyNames(err)),
            };
        }
    }

    // requirement for compose of a change with it's inverse.
    function isComposeWithInverseEqualsEmpty(changeA: TChange) {
        try {
            const changeset = compose([
                changeA,
                invert(changeA),
            ]);
            const reqFailure: Error<TChange> = {
                changes: changeA,
                error: "requirement failure",
            };
            const equivalent = isEquivalent(changeset, compose([]));
            return equivalent ? true : reqFailure;
        } catch (err) {
            return {
                changes: changeA,
                error: JSON.stringify(err, Object.getOwnPropertyNames(err)),
            };
        }
    }

    // compose([ε, A]) => A && compose([A, ε]) => A
    function isComposeWithEmptyNoOp(changeA: TChange) {
        try {
            const noOp = compose([]);
            const changeset1 = compose([changeA, noOp]);
            const changeset2 = compose([noOp, changeA]);
            const reqFailure: Error<TChange> = {
                changes: changeA,
                error: "requirement failure",
            };
            const equivalent = isEquivalent(changeset1, changeset2) && isEquivalent(changeset1, changeA);
            return equivalent ? true : reqFailure;
        } catch (err) {
            return {
                changes: changeA,
                error: JSON.stringify(err, Object.getOwnPropertyNames(err)),
            };
        }
    }

    // rebase(A, ε) => A
    function isRebaseOverEmptyNoOp(changeA: TChange) {
        try {
            const noOp = compose([]);
            const changeset = rebase(changeA, noOp);
            const reqFailure: Error<TChange> = {
                changes: changeA,
                error: "requirement failure",
            };
            const equivalent = isEquivalent(changeset, changeA);
            return equivalent ? true : reqFailure;
        } catch (err) {
            return {
                changes: changeA,
                error: JSON.stringify(err, Object.getOwnPropertyNames(err)),
            };
        }
    }

    // rebase(ε, A) => ε
    function isRebaseEmptyEmpty(changeA: TChange) {
        try {
            const noOp = compose([]);
            const changeset = rebase(noOp, changeA);
            const reqFailure: Error<TChange> = {
                changes: changeA,
                error: "requirement failure",
            };
            const equivalent = isEquivalent(changeset, noOp);
            return equivalent ? true : reqFailure;
        } catch (err) {
            return {
                changes: changeA,
                error: JSON.stringify(err, Object.getOwnPropertyNames(err)),
            };
        }
    }

    // invert(ε) => ε
    function isEmptyInverseEmpty(changeA: TChange) {
        try {
            const noOp = compose([]);
            const changeset = invert(noOp);
            const reqFailure: Error<TChange> = {
                changes: changeA,
                error: "requirement failure",
            };
            const equivalent = isEquivalent(changeset, noOp);
            return equivalent ? true : reqFailure;
        } catch (err) {
            return {
                changes: changeA,
                error: JSON.stringify(err, Object.getOwnPropertyNames(err)),
            };
        }
    }
}
