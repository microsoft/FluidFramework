// TODO: Should move Formula to a separate file.
import { BoxState, Inline } from "@prague/app-ui";
import { IllFormedFormula, NotImplemented, ResultKind, Workbook } from "../../ext/calc";
import { FlowViewContext } from "./flowViewContext";

export class FormulaState extends BoxState {
    public formula: string;
}

/** Renders a Formula as an inline box. */
export class Formula extends Inline<FormulaState> {

    protected measuring(self: FormulaState, context: FlowViewContext) {
        let width;

        this.withStyle(context, () => {
            width = context.measureText(this.getEvaluatedFormula(self, context.services)).width;
        });

        return { min: width, max: width };
    }

    protected mounting(self: FormulaState, context: FlowViewContext) {
        const span = document.createElement("span");
        this.updating(self, context, span);
        return span;
    }

    protected unmounting(self: FormulaState, context: FlowViewContext, element: HTMLElement) {
        // NYI: FlowView currently does not unmount components as they are removed.
    }

    protected updating(self: FormulaState, context: FlowViewContext, element: HTMLElement) {
        this.withStyle(context, () => {
            element.style.font = context.style.font;
            element.innerText = this.getEvaluatedFormula(self, context.services);
        });

        return element;
    }
    private withStyle(context: FlowViewContext, scope: () => void) {
        context.withStyle({ font: "italic " + context.style.font }, scope);
    }

    /** Returns the post-evaluated  */
    private getEvaluatedFormula(self: FormulaState, services: Map<string, any>) {
        // If the service is not yet available, return a 'loading' message.
        const workbook = services && services.get("workbook") as Workbook;
        if (typeof workbook === "undefined") {
            return `[Loading: '${self.formula}']`;
        }

        // ...otherwise, evaluate the formula and return the result as a string or an appropriate
        // error message.
        const result = workbook.evaluateFormulaText(self.formula, 0, 0);
        switch (result.kind) {
            case ResultKind.Success:
                return result.value.toString();
            case ResultKind.Failure:
                // Pretty-print some of the common errors...
                const reason = result.reason;
                switch (reason.kind) {
                    case "NotImplemented": {
                        const reasonText = (result.reason as NotImplemented).features.join(", ");
                        return `[#Error in '${self.formula}': ${reasonText}.]`;
                    }
                    case "IllFormedFormula": {
                        return `[#Error in '${self.formula}': ${(reason as IllFormedFormula).message}]`;
                    }
                }
                // For uncommon errors, print the JSON serialization of the result.
                return `[#${result.reason} in '${self.formula}': ${JSON.stringify(result)}]`;
            default:
                return `[#Error in '${self.formula}': Unexpected result kind: '${result.kind}']`;
        }
    }
}
