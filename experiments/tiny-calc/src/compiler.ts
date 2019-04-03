import { IRef, parse } from "./parser";

export function compile(formula: string, cellResolver: ($: RegExpExecArray) => string) {
    if (!formula.startsWith("=")) {
        throw new Error(`Invalid formula: '${formula}'`);
    }

    // Parse the formula expression to find all cell references.
    formula = formula.slice(1);
    const { refs } = parse(formula);

    // For each cell reference found in the formula string, replace it with the output of cellResolver.
    {
        refs.sort((left, right) => left.end - right.end);
        let ref: IRef;
        // tslint:disable-next-line:no-conditional-assignment
        while (ref = refs.pop()) {
            const r = cellResolver(ref.$);
            formula = `${formula.slice(0, ref.start)}${r}${formula.slice(ref.end)}`;
        }
    }

    // Compile the result as a JavaScript function.
    return new Function("_", `return ${formula}`);
}
