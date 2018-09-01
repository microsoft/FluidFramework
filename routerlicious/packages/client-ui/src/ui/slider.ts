import { Box } from ".";
import { IllFormedFormula, NotImplemented, ResultKind, Workbook } from "../../ext/calc";

export interface ISliderState {
    value: string;
}

/** Renders a Formula as an inline box. */
export class Slider extends Box<ISliderState> {
    public measure(self: ISliderState, services: Map<string, any>, font: string) {
        // TODO: Somehow make this changeable based on range?
        return 10;
    }

    public render(self: ISliderState, services: Map<string, any>) {
        // TODO: Styles should be passed in as part of a component-standard render context.
        const slider = document.createElement("input");
        slider.className = "slider";
        slider.type = "range";
        slider.min = "1";
        slider.max = "100";
        slider.value = this.getEvaluatedFormula(self, services);

        const span = document.createElement("span");
        span.appendChild(slider);

        return span;
    }

    /** Returns the post-evaluated  */
    private getEvaluatedFormula(self: ISliderState, services: Map<string, any>) {
        // If the service is not yet available, return a 'loading' message.
        const workbook = services && services.get("workbook") as Workbook;
        if (typeof workbook === "undefined") {
            return `[Loading: '${self.value}']`;
        }

        // ...otherwise, evaluate the formula and return the result as a string or an appropriate
        // error message.
        const result = workbook.evaluateFormulaText(self.value, 0, 0);
        switch (result.kind) {
            case ResultKind.Success:
                return result.value.toString();
            case ResultKind.Failure:
                // Pretty-print some of the common errors...
                const reason = result.reason;
                switch (reason.kind) {
                    case "NotImplemented": {
                        const reasonText = (result.reason as NotImplemented).features[0].split(":")[1].trim();
                        return `[#Error in '${self.value}': Not implemented: ${reasonText}.]`;
                    }
                    case "IllFormedFormula": {
                        return `[#Error in '${self.value}': ${(reason as IllFormedFormula).message}]`;
                    }
                }
                // For uncommon errors, print the JSON serialization of the result.
                return `[#${result.reason} in '${self.value}': ${JSON.stringify(result)}]`;
            default:
                return `[#Error in '${self.value}': Unexpected result kind: '${result.kind}']`;
        }
    }
}
