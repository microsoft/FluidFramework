// TODO: Should move Formula to a separate file.
import { Box } from ".";
import { IllFormedFormula, NotImplemented, ResultKind, Workbook } from "../../ext/calc";

// TODO: "typeof" test is currently necessary due to static 'refTypeToComponent' map
//       in registry.ts instantiating the 'Formula' singleton when the module loads
//       in node during tests. 
const measure2d = (typeof document !== "undefined") && document.createElement("canvas").getContext("2d");

// TODO: Should plumb through access to the caching implementation from FlowView.
const measureTextWidth = (font: string, text: string) => {
    measure2d.font = font;
    return measure2d.measureText(text).width;
};

export interface IFormulaState {
    formula: string;
}

/** Renders a Formula as an inline box. */
export class Formula extends Box<IFormulaState> {
    public measure(self: IFormulaState, services: Map<string, any>, font: string) {
        // TODO: Styles should be passed in as part of a component-standard layout context.
        font += " italic";
        return measureTextWidth(font, this.getEvaluatedFormula(self, services));
    }

    public render(self: IFormulaState, services: Map<string, any>) {
        // TODO: Styles should be passed in as part of a component-standard render context.
        const span = document.createElement("span");
        span.style.fontStyle = "italic";
        span.innerText = this.getEvaluatedFormula(self, services);
        return span;
    }

    /** Returns the post-evaluated  */
    private getEvaluatedFormula(self: IFormulaState, services: Map<string, any>) {
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
