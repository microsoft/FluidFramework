/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeRebaser } from "../rebase";

interface outputType {
    "requirement1": string | any[];
    "requirement2": string | any[];
    "requirement3": string | any[];
    "doUndoPair": string | any[];
    "sandwichRebase": string | any[];
    "changeWithInverse": string | any[];
}
export function testChangeRebaser<TChange>(rebaser: ChangeRebaser<TChange>,
    changes: ReadonlySet<TChange>,
    isEquivalent: (a: TChange, b: TChange) => boolean): outputType {
    const rebase = rebaser.rebase.bind(rebaser);
    const compose = rebaser.compose.bind(rebaser);
    const invert = rebaser.invert.bind(rebaser);

    const output: outputType = {
        requirement1: "PASSED",
        requirement2: "PASSED",
        requirement3: "PASSED",
        doUndoPair: "PASSED",
        sandwichRebase: "PASSED",
        changeWithInverse: "PASSED",
    };

    for (const changeA of changes) {
        if (!checkChangeWithInverse(changeA)) {
            output.changeWithInverse = [changeA];
        }
        for (const changeB of changes) {
            if (!checkDoUndoPair(changeA, changeB)) {
                output.doUndoPair = [changeA, changeB];
                return output;
            }
            if (!checkSandwichRebase(changeA, changeB)) {
                output.doUndoPair = [changeA, changeB];
                return output;
            }

            for (const changeC of changes) {
                if (!requirement1(changeA, changeB, changeC)) {
                    output.requirement1 = [changeA, changeB, changeC];
                    return output;
                }

                if (!requirement2(changeA, changeB, changeC)) {
                    output.requirement2 = [changeA, changeB, changeC];
                    return output;
                }

                if (!requirement3(changeA, changeB, changeC)) {
                    output.requirement2 = [changeA, changeB, changeC];
                    return output;
                }
            }
        }
    }

    return output;

    // Requirement testing the rebasing of composed changes and rebased changes.
    function requirement1(changeA: TChange, changeB: TChange, changeC: TChange) {
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
    function requirement2(changeA: TChange, changeB: TChange, changeC: TChange) {
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

    function requirement3(changeA: TChange, changeB: TChange, changeC: TChange) {
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
    function checkDoUndoPair(changeA: TChange, changeB: TChange) {
        const inv = invert(changeB);
        const r1 = rebase(changeA, changeB);
        const r2 = rebase(r1, inv);
        return isEquivalent(r2, changeA);
    }

    // requirement for sandwich rebasing
    function checkSandwichRebase(changeA: TChange, changeB: TChange) {
        const inv2 = invert(changeB);
        const r1 = rebase(changeA, changeB);
        const r2 = rebase(r1, inv2);
        const r3 = rebase(r2, changeB);
        return isEquivalent(r3, r2);
    }

    // requirement for compose of a change with it's inverse.
    function checkChangeWithInverse(changeA: TChange) {
        const changeset = compose([
            invert(changeA),
            changeA,
        ]);

        return isEquivalent(changeset, compose([]));
    }
}
