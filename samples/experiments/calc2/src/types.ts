import { BlankOper } from "@ms/excel-online-calc/lib/lang/value";
import { OperKind } from "@ms/excel-online-calc/lib/lang/types";
import { CheckedFormula, WellFormedFormula } from "@ms/excel-online-calc/lib/lang/formula";

/** True if the given oper is the BlankOper. */
export function isBlankOper(oper: any): oper is BlankOper {
    return ((oper && (oper as BlankOper).kind === OperKind.Blank)
        ? true
        : false);
}

/** True if the given string begins with '='. */
export function isFormulaString(input: any): input is string {
    return (typeof input === "string" && input[0] === "=");
}

/** True if the given CheckedFormula is a WellFormedFormula. */
export function isWellFormed(f: CheckedFormula): f is WellFormedFormula {
    return f.isWellFormed;
}
