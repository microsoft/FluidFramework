// TODO: Should plumb through access to the caching implementation from FlowView.
const measureTextWidth = (font: string, text: string) => {
    const measure2d = document.createElement("canvas").getContext("2d");
    measure2d.font = font;
    return measure2d.measureText(text).width;
};

/**
 * A box component to be displayed inline inside a FlowView.  Note that instances are
 * singletons w/their persisted state and UI services passed to them as needed.
 */
export abstract class Box<TState> {
    // TODO: font & services should be passed as part of a component-standard 'LayoutContent'
    // TODO: Likely should follow the CSS box model returning a min/max width.
    /** Returns the desired width of a inline box. */
    public abstract measure(self: TState, services: Map<string, any>, font: string): number;

    // TODO: services should be passed as part of a component-standard 'RenderContent'
    /** Returns the emitted HTML of an inline box. */
    public abstract render(self: TState, services: Map<string, any>): HTMLElement;
}

// TODO: Should move Formula to a separate file.
import { IllFormedFormula, NotImplemented, ResultKind, Workbook } from "../../ext/calc";

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
                        const reasonText = (result.reason as NotImplemented).features[0].split(":")[1].trim();
                        return `[#Error in '${self.formula}': Not implemented: ${reasonText}.]`;
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
        slider.type = "range";
        slider.min = "1";
        slider.max = "100";
        slider.value = this.getEvaluatedFormula(self, services);
        // slider.style =
        return slider;
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

// TODO: Component registry should not be static/global.
export const refTypeNameToComponent = new Map<string, Box<any>>([
    ["formula", new Formula()],
    ["slider", new Slider()],
]);
