/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeRebaser } from ".";

export type Failure<TCase> = Violation<TCase> | Exception<TCase>;

export interface Violation<TCase> {
    type: "Violation";
    case: TCase;
}

export interface Exception<TCase> {
    type: "Error";
    case: TCase;
    error: unknown;
}

export interface OutputType<TChange> {
    /**
     * "Passed" iff `(A ○ B) ○ C = A (B ○ C) = A ○ B ○ C`,
     * otherwise a triple that violates the axiom.
     */
    composeAssociativity: Failure<[TChange, TChange, TChange]>[];
    /**
     * "Passed" iff `A ↷ (B ○ C) = (A ↷ B) ↷ C`,
     * otherwise a triple that violates the axiom.
     */
    rebaseLeftDistributivity: Failure<[TChange, TChange, TChange]>[];
    /**
     * "Passed" iff `(A ○ B) ↷ C = (A ↷ C) ○ (B ↷ (A⁻¹ ○ C ○ (A ↷ C)) ↷ C)`,
     * otherwise a triple that violates the axiom.
     */
    rebaseRightDistributivity: Failure<[TChange, TChange, TChange]>[];
    /**
     * "Passed" iff `(A ↷ B) ↷ B⁻¹ = A`,
     * otherwise a pair that violates the axiom.
     */
    rebaseOverDoUndoPairIsNoOp: Failure<[TChange, TChange]>[];
    /**
     * "Passed" iff `((A ↷ B) ↷ B⁻¹) ↷ B = A ↷ B`,
     * otherwise a pair that violates the axiom.
     */
    rebaseOverUndoRedoPairIsNoOp: Failure<[TChange, TChange]>[];
    /**
     * "Passed" iff `A ○ A⁻¹ = ε` where `ε` is the empty change,
     * otherwise a change that violates the axiom.
     */
    composeWithInverseIsNoOp: Failure<TChange>[];
    /**
     * "Passed" iff `A ○ ε` is equal to `ε ○ A` which equals to `A` where `ε` is the empty change,
     * otherwise a change that violates the axiom.
     */
    composeWithEmptyIsNoOp: Failure<TChange>[];
    /**
     * "Passed" iff `(A ↷ ε) = A`,
     * otherwise a change that violates the axiom.
     */
    rebaseOverEmptyIsNoOp: Failure<TChange>[];
    /**
     * "Passed" iff `(ε ↷ A) = ε`,
     * otherwise a change that violates the axiom.
     */
    rebaseEmptyIsEmpty: Failure<TChange>[];
    /**
     * "Passed" iff `ε⁻¹ = ε`,
     * otherwise a change that violates the axiom.
     */
    emptyInverseIsEmpty: Failure<TChange>[];
}

export const noFailure: OutputType<unknown> = {
    rebaseLeftDistributivity: [],
    rebaseRightDistributivity: [],
    composeAssociativity: [],
    rebaseOverDoUndoPairIsNoOp: [],
    rebaseOverUndoRedoPairIsNoOp: [],
    composeWithInverseIsNoOp: [],
    composeWithEmptyIsNoOp: [],
    rebaseOverEmptyIsNoOp: [],
    rebaseEmptyIsEmpty: [],
    emptyInverseIsEmpty: [],
};

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
        rebaseLeftDistributivity: [],
        rebaseRightDistributivity: [],
        composeAssociativity: [],
        rebaseOverDoUndoPairIsNoOp: [],
        rebaseOverUndoRedoPairIsNoOp: [],
        composeWithInverseIsNoOp: [],
        composeWithEmptyIsNoOp: [],
        rebaseOverEmptyIsNoOp: [],
        rebaseEmptyIsEmpty: [],
        emptyInverseIsEmpty: [],
    };

    for (const changeA of changes) {
        const requirement1 = isComposeWithInverseEqualsEmpty(changeA);
        if (requirement1 !== true) {
            output.composeWithInverseIsNoOp.push(requirement1);
        }
        const requirement2 = isComposeWithEmptyNoOp(changeA);
        if (requirement2 !== true) {
            output.composeWithEmptyIsNoOp.push(requirement2);
        }
        const requirement3 = isRebaseOverEmptyNoOp(changeA);
        if (requirement3 !== true) {
            output.rebaseOverEmptyIsNoOp.push(requirement3);
        }
        const requirement4 = isRebaseEmptyEmpty(changeA);
        if (requirement4 !== true) {
            output.rebaseEmptyIsEmpty.push(requirement4);
        }
        const requirement5 = isEmptyInverseEmpty(changeA);
        if (requirement5 !== true) {
            output.emptyInverseIsEmpty.push(requirement5);
        }
        for (const changeB of changes) {
            const requirement6 = isRebaseOverDoUndoPairNoOp(changeA, changeB);
            if (requirement6 !== true) {
                output.rebaseOverDoUndoPairIsNoOp.push(requirement6);
            }
            const requirement7 = isRebaseOverUndoRedoPairNoOp(changeA, changeB);
            if (requirement7 !== true) {
                output.rebaseOverUndoRedoPairIsNoOp.push(requirement7);
            }
            for (const changeC of changes) {
                const requirement8 = isRebaseLeftDistributive(changeA, changeB, changeC);
                if (requirement8 !== true) {
                    output.rebaseLeftDistributivity.push(requirement8);
                }
                const requirement9 = isComposeAssociative(changeA, changeB, changeC);
                if (requirement9 !== true) {
                    output.composeAssociativity.push(requirement9);
                }
                const requirement10 = isRebaseRightDistributive(changeA, changeB, changeC);
                if (requirement10 !== true) {
                    output.rebaseRightDistributivity.push(requirement10);
                }
            }
        }
    }

    return output;

    // Requirement testing the rebasing of composed changes and rebased changes.
    function isRebaseLeftDistributive(
        changeA: TChange,
        changeB: TChange,
        changeC: TChange,
    ): true | Failure<[TChange, TChange, TChange]> {
        try {
            const rebaseChangeset1 = rebase(changeA, compose([changeB, changeC]));
            const rebaseChangeset2 = rebase(rebase(changeA, changeB), changeC);
            const equivalent = isEquivalent(rebaseChangeset1, rebaseChangeset2);
            if (equivalent) {
                return true;
            }
            return {
                type: "Violation",
                case: [changeA, changeB, changeC],
            };
        } catch (error) {
            return {
                type: "Error",
                case: [changeA, changeB, changeC],
                error,
            };
        }
    }

    // Requirement checking different ordering of composed changes
    function isComposeAssociative(
        changeA: TChange,
        changeB: TChange,
        changeC: TChange,
    ): true | Failure<[TChange, TChange, TChange]> {
        try {
            const changeset1 = compose([changeA, compose([changeB, changeC])]);
            const changeset2 = compose([compose([changeA, changeB]), changeC]);
            const changeset3 = compose([changeA, changeB, changeC]);
            const equivalent =
                isEquivalent(changeset1, changeset2) && isEquivalent(changeset1, changeset3);
            if (equivalent) {
                return true;
            }
            return {
                type: "Violation",
                case: [changeA, changeB, changeC],
            };
        } catch (error) {
            return {
                type: "Error",
                case: [changeA, changeB, changeC],
                error,
            };
        }
    }

    function isRebaseRightDistributive(
        changeA: TChange,
        changeB: TChange,
        changeC: TChange,
    ): true | Failure<[TChange, TChange, TChange]> {
        try {
            const changeset1 = rebase(compose([changeA, changeB]), changeC);
            const changeset2 = compose([
                rebase(changeA, changeC),
                rebase(changeB, compose([invert(changeA), changeC, rebase(changeA, changeC)])),
            ]);
            const equivalent = isEquivalent(changeset1, changeset2);
            if (equivalent) {
                return true;
            }
            return {
                type: "Violation",
                case: [changeA, changeB, changeC],
            };
        } catch (error) {
            return {
                type: "Error",
                case: [changeA, changeB, changeC],
                error,
            };
        }
    }

    // requirement for do-undo pair
    function isRebaseOverDoUndoPairNoOp(
        changeA: TChange,
        changeB: TChange,
    ): true | Failure<[TChange, TChange]> {
        try {
            const inv = invert(changeB);
            const r1 = rebase(changeA, changeB);
            const r2 = rebase(r1, inv);
            const equivalent = isEquivalent(r2, changeA);
            if (equivalent) {
                return true;
            }
            return {
                type: "Violation",
                case: [changeA, changeB],
            };
        } catch (error) {
            return {
                type: "Error",
                case: [changeA, changeB],
                error,
            };
        }
    }

    // requirement for sandwich rebasing
    function isRebaseOverUndoRedoPairNoOp(
        changeA: TChange,
        changeB: TChange,
    ): true | Failure<[TChange, TChange]> {
        try {
            const invB = invert(changeB);
            const r1 = rebase(changeA, changeB);
            const r2 = rebase(r1, invB);
            const r3 = rebase(r2, changeB);
            const equivalent = isEquivalent(r3, r1);
            if (equivalent) {
                return true;
            }
            return {
                type: "Violation",
                case: [changeA, changeB],
            };
        } catch (error) {
            return {
                type: "Error",
                case: [changeA, changeB],
                error,
            };
        }
    }

    // requirement for compose of a change with it's inverse.
    function isComposeWithInverseEqualsEmpty(changeA: TChange): true | Failure<TChange> {
        try {
            const changeset = compose([changeA, invert(changeA)]);
            const equivalent = isEquivalent(changeset, compose([]));
            return equivalent ? true : { type: "Violation", case: changeA };
        } catch (error) {
            return {
                type: "Error",
                case: changeA,
                error,
            };
        }
    }

    // compose([ε, A]) => A && compose([A, ε]) => A
    function isComposeWithEmptyNoOp(changeA: TChange): true | Failure<TChange> {
        try {
            const noOp = compose([]);
            const changeset1 = compose([changeA, noOp]);
            const changeset2 = compose([noOp, changeA]);
            const equivalent =
                isEquivalent(changeset1, changeset2) && isEquivalent(changeset1, changeA);
            return equivalent ? true : { type: "Violation", case: changeA };
        } catch (error) {
            return {
                type: "Error",
                case: changeA,
                error,
            };
        }
    }

    // rebase(A, ε) => A
    function isRebaseOverEmptyNoOp(changeA: TChange): true | Failure<TChange> {
        try {
            const noOp = compose([]);
            const changeset = rebase(changeA, noOp);
            const equivalent = isEquivalent(changeset, changeA);
            return equivalent ? true : { type: "Violation", case: changeA };
        } catch (error) {
            return {
                type: "Error",
                case: changeA,
                error,
            };
        }
    }

    // rebase(ε, A) => ε
    function isRebaseEmptyEmpty(changeA: TChange): true | Failure<TChange> {
        try {
            const noOp = compose([]);
            const changeset = rebase(noOp, changeA);
            const equivalent = isEquivalent(changeset, noOp);
            return equivalent ? true : { type: "Violation", case: changeA };
        } catch (error) {
            return {
                type: "Error",
                case: changeA,
                error,
            };
        }
    }

    // invert(ε) => ε
    function isEmptyInverseEmpty(changeA: TChange): true | Failure<TChange> {
        try {
            const noOp = compose([]);
            const changeset = invert(noOp);
            const equivalent = isEquivalent(changeset, noOp);
            return equivalent ? true : { type: "Violation", case: changeA };
        } catch (error) {
            return {
                type: "Error",
                case: changeA,
                error,
            };
        }
    }
}
