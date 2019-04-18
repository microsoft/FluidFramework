// Simple demo which evaluates '=2+2' to show that '@ms/excel-online-calc' successfully imports and runs in a node environment.

// ES6 module loading is bootstrapped via 'esm' in index.js
import { parse, config as cfg, formula } from '@ms/excel-online-calc/lib';
import { createParseGlobals } from '@ms/excel-online-calc/lib/test/parseContext';
import { RefStyle } from '@ms/excel-online-calc/lib/lang/formula';
import { FormulaSource } from '@ms/excel-online-calc/lib/lang/location';
import { createSingleRange } from '@ms/excel-online-calc/lib/test/util';
import { createEvalGlobals } from '@ms/excel-online-calc/lib/test/evalContext';
import { createEvaluator } from '@ms/excel-online-calc/lib/runtime/evaluatorService';
import { compiled, makeTestContext } from '@ms/excel-online-calc/lib/runtime/testUtils'

const testContext = makeTestContext();
const parser = parse.createParser(createParseGlobals(testContext.config));
const f1 = parser.parseFormula(RefStyle.R1C1, undefined, FormulaSource.Cell, "=2+2").value

const evaluator = createEvaluator(createEvalGlobals(testContext.config));
const range = createSingleRange(3, 2);

console.log(evaluator.evalFormula(range, FormulaSource.Cell, compiled(testContext, undefined, FormulaSource.Cell, f1), undefined))
