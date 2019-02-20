import { BoxState, Inline } from "@prague/app-ui";
import { FlowViewContext } from ".";
import { IllFormedFormula, NotImplemented, ResultKind, Workbook } from "../../../ext/calc";

export class SliderState extends BoxState {
    public value: string;
}

const parseRowColExp = /=\s*([A-Z]+)([0-9]+)/;
const asciiA = "A".charCodeAt(0);

/** Renders a Formula as an inline box. */
export class Slider extends Inline<SliderState> {
    private readonly width = 100;

    protected measuring(self: SliderState, context: FlowViewContext): { min: number; max: number; } {
        return { min: this.width, max: this.width };
    }

    protected mounting(self: SliderState, context: FlowViewContext): HTMLElement {
        const span = document.createElement("span");
        return this.updating(self, context, span);
    }

    protected unmounting(self: BoxState, context: FlowViewContext, element: HTMLElement): void {
        // NYI: FlowView currently does not unmount components as they are removed.
    }

    protected updating(self: SliderState, context: FlowViewContext, element: HTMLElement): HTMLElement {
        let slider = element.getElementsByTagName("input")[0];

        if (!slider) {
            slider = document.createElement("input");
            slider.className = "slider";
            slider.type = "range";
            slider.min = "0";
            slider.max = "10";
            slider.style.width = `${this.width}px`;
            slider.addEventListener("mouseup", (e) => {
                const workbook = context.services.get("workbook") as Workbook;
                const [row, col] = this.parseRowCol(self.value);
                workbook.setCellText(row, col, slider.value);
            });
            element.appendChild(slider);
        }

        slider.value = this.getEvaluatedFormula(self, context.services);
        return element;
    }

    private parseRowCol(text: string) {
        const matches = parseRowColExp.exec(text.toUpperCase());
        return [ parseInt(matches[2], 10) - 1, matches[1].charCodeAt(0) - asciiA ];
    }

    /** Returns the post-evaluated  */
    private getEvaluatedFormula(self: SliderState, services: Map<string, any>) {
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
