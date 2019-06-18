/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as MathAgent from './agent';

namespace Driver {
    function logCheck(checker: MathAgent.Checker, text: string) {
        console.log("checking whether " + text + " simplifies to " +
            checker.axiomText + " ... " + (checker.check(text) ? "yes" : "no"));
    }

    function runCheckerTests() {
        var checker = MathAgent.createChecker("a=0", "a");
        logCheck(checker, "a=1");
        logCheck(checker, "a=0");
        logCheck(checker, "2a-2=-2");
        checker = MathAgent.createChecker("(-1--5)/(2a+1-3)=(2--5)/(a-1-3)", "a");
        logCheck(checker, "a=-1/5");
    }
    runCheckerTests();
}


