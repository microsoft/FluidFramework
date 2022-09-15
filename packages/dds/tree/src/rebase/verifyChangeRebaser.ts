/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeRebaser } from ".";

export type Passed = "Passed";

export interface OutputType<TChange> {
    /**
     * "Passed" iff `(A ○ B) ○ C = A (B ○ C) = A ○ B ○ C`,
     * otherwise a triple that violates the axiom.
     */
    composeAssociativity: Passed | [TChange, TChange, TChange];
    /**
     * "Passed" iff `A ↷ (B ○ C) = (A ↷ B) ↷ C`,
     * otherwise a triple that violates the axiom.
     */
    rebaseLeftDistributivity: Passed | [TChange, TChange, TChange];
    /**
     * "Passed" iff `(A ○ B) ↷ C = (A ↷ C) ○ (B ↷ (A⁻¹ ○ C ○ (A ↷ C)) ↷ C)`,
     * otherwise a triple that violates the axiom.
     */
    rebaseRightDistributivity: Passed | [TChange, TChange, TChange];
    /**
     * "Passed" iff `(A ↷ B) ↷ B⁻¹ = A`,
     * otherwise a pair that violates the axiom.
     */
    rebaseOverDoUndoPairIsNoOp: Passed | [TChange, TChange];
    /**
     * "Passed" iff `((A ↷ B) ↷ B⁻¹) ↷ B = A ↷ B`,
     * otherwise a pair that violates the axiom.
     */
    rebaseOverUndoRedoPairIsNoOp: Passed | [TChange, TChange];
    /**
     * "Passed" iff `A ○ A⁻¹ = ε` where `ε` is the empty change,
     * otherwise a change that violates the axiom.
     */
    composeWithInverseIsNoOp: Passed | TChange;
    /**
     * "Passed" iff `A ○ ε` is equal to `ε ○ A` which equals to `A` where `ε` is the empty change,
     * otherwise a change that violates the axiom.
     */
    composeWithEmptyIsNoOp: Passed | TChange;
     /**
     * "Passed" iff `(A ↷ ε) = A`,
     * otherwise a change that violates the axiom.
     */
    rebaseOverEmptyIsNoOp: Passed | TChange;
    /**
     * "Passed" iff `(ε ↷ A) = ε`,
     * otherwise a change that violates the axiom.
     */
    rebaseEmptyIsEmpty: Passed | TChange;
     /**
     * "Passed" iff `ε⁻¹ = ε`,
     * otherwise a change that violates the axiom.
     */
    emptyInverseIsEmpty: Passed | TChange;

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
        if (!isComposeWithInverseEqualsEmpty(changeA)) {
            output.composeWithInverseIsNoOp = changeA;
        }
        if (!isComposeWithEmptyNoOp(changeA)) {
            output.composeWithEmptyIsNoOp = changeA;
        }
        if (!isRebaseOverEmptyNoOp(changeA)) {
            output.rebaseOverEmptyIsNoOp = changeA;
        }
        if (!isRebaseEmptyEmpty(changeA)) {
            output.rebaseEmptyIsEmpty = changeA;
        }
        if (!isEmptyInverseEmpty(changeA)) {
            output.emptyInverseIsEmpty = changeA;
        }
        for (const changeB of changes) {
            if (!isRebaseOverDoUndoPairNoOp(changeA, changeB)) {
                output.rebaseOverDoUndoPairIsNoOp = [changeA, changeB];
            }
            if (!isRebaseOverUndoRedoPairNoOp(changeA, changeB)) {
                output.rebaseOverUndoRedoPairIsNoOp = [changeA, changeB];
            }
            for (const changeC of changes) {
                if (!isRebaseLeftDistributive(changeA, changeB, changeC)) {
                    output.rebaseLeftDistributivity = [changeA, changeB, changeC];
                }
                if (!isComposeAssociative(changeA, changeB, changeC)) {
                    output.composeAssociativity = [changeA, changeB, changeC];
                }
                if (!isRebaseRightDistributive(changeA, changeB, changeC)) {
                    output.rebaseRightDistributivity = [changeA, changeB, changeC];
                }
            }
        }
    }

    return output;

    // Requirement testing the rebasing of composed changes and rebased changes.
    function isRebaseLeftDistributive(changeA: TChange, changeB: TChange, changeC: TChange) {
        const rebaseChangeset1 = rebase(
            changeA,
            compose([changeB, changeC]),
        );
        const rebaseChangeset2 = rebase(
            rebase(changeA, changeB),
            changeC,
        );
        return isEquivalent(rebaseChangeset1, rebaseChangeset2);
    }

    // Requirement checking different ordering of composed changes
    function isComposeAssociative(changeA: TChange, changeB: TChange, changeC: TChange) {
        const changeset1 = compose([
            changeA,
            compose([changeB, changeC]),
        ]);
        const changeset2 = compose([
            compose([changeA, changeB]),
            changeC,
        ]);
        const changeset3 = compose([changeA, changeB, changeC]);
        return isEquivalent(changeset1, changeset2) && isEquivalent(changeset1, changeset3);
    }

    function isRebaseRightDistributive(changeA: TChange, changeB: TChange, changeC: TChange) {
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
        return isEquivalent(changeset1, changeset2);
    }

    // requirement for do-undo pair
    function isRebaseOverDoUndoPairNoOp(changeA: TChange, changeB: TChange) {
        const inv = invert(changeB);
        const r1 = rebase(changeA, changeB);
        const r2 = rebase(r1, inv);
        return isEquivalent(r2, changeA);
    }

    // requirement for sandwich rebasing
    function isRebaseOverUndoRedoPairNoOp(changeA: TChange, changeB: TChange) {
        const invB = invert(changeB);
        const r1 = rebase(changeA, changeB);
        const r2 = rebase(r1, invB);
        const r3 = rebase(r2, changeB);
        return isEquivalent(r3, r1);
    }

    // requirement for compose of a change with it's inverse.
    function isComposeWithInverseEqualsEmpty(changeA: TChange) {
        const changeset = compose([
            changeA,
            invert(changeA),
        ]);
        return isEquivalent(changeset, compose([]));
    }

    // compose([ε, A]) => A && compose([A, ε]) => A
    function isComposeWithEmptyNoOp(changeA: TChange) {
        const noOp = compose([]);
        const changeset1 = compose([changeA, noOp]);
        const changeset2 = compose([noOp, changeA]);
        return isEquivalent(changeset1, changeset2) && isEquivalent(changeset1, changeA);
    }

    // rebase(A, ε) => A
    function isRebaseOverEmptyNoOp(changeA: TChange) {
        const noOp = compose([]);
        const changeset = rebase(changeA, noOp);
        return isEquivalent(changeset, changeA);
    }

    // rebase(ε, A) => ε
    function isRebaseEmptyEmpty(changeA: TChange) {
        const noOp = compose([]);
        const changeset = rebase(noOp, changeA);
        return isEquivalent(changeset, noOp);
    }

    // invert(ε) => ε
    function isEmptyInverseEmpty(changeA: TChange) {
        const noOp = compose([]);
        const changeset = invert(noOp);
        return isEquivalent(changeset, noOp);
    }
}
