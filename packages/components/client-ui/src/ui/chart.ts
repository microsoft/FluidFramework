import { Block, BoxState } from "@prague/app-ui";
import { ResultKind } from "../../ext/calc";
import * as Charts from "../../ext/microsoft-charts/";
import { SharedWorkbook } from "../calc";
import { FlowViewContext } from "./flowViewContext";

const chartSym = Symbol("Chart.chart");

export class ChartState extends BoxState {
    public [chartSym]?: Charts.Chart;
}

/** Renders a worksheet as a chart using IvyCharts service. */
export class Chart extends Block<ChartState> {
    private readonly host = new Charts.Host({
        base: "https://charts.microsoft.com",
    });

    protected mounting(self: ChartState, context: FlowViewContext): HTMLElement {
        // Create the div to which the Chart will attach the SVG rendered chart when the
        // web service responds.
        const div = document.createElement("div");

        // Call 'updating' to update the contents of the div with the updated chart.
        return this.updating(self, context, div);
    }

    protected unmounting(self: BoxState, context: FlowViewContext, element: HTMLElement): void {
        // NYI: FlowView currently does not unmount components as they are removed.
    }

    protected updating(self: ChartState, context: FlowViewContext, element: HTMLElement): HTMLElement {
        const workbook = context.services.get("workbook");

        // If the workbook is still loading then early exit.
        if (workbook === undefined) {
            // Display a placeholder message until the workbook loads.
            element.innerText = "[ Loading... ]";
            return element;
        }

        const height = 260;
        if (!self[chartSym]) {
            // We're creating the chart component for the first time.  Remove the placeholder content
            // (if any).
            while (element.lastChild) {
                element.removeChild(element.lastChild);
            }

            // Explicitly set div height to match the chart that will asynchronously arrive from
            // the web service.  This reserves the appropriate amount of vertical space in the
            // FlowView, avoiding the need for a later invalidation/resize when the chart arrives.
            element.style.height = `${height}px`;
            element.style.justifyContent = "center";

            self[chartSym] = new Charts.Chart(this.host, element);
            self[chartSym].setRenderer(Charts.IvyRenderer.Svg);
        }

        // TODO: Component state should specify which region of the workbook contains
        //       category names.  Currently hard-coded to 'A2:A(maxRows - 1)'
        const categoryNames = [];
        for (let r = 1; r < workbook.numRows - 1; r++) {
            categoryNames.push(this.getAt(workbook, r, 0));
        }

        // TODO: Component state should specify which region of the workbook contains
        //       the values for the chart.  Currently hard-coded to 'E2:E(maxRows - 1)'
        const values = [];
        for (let r = 1; r < workbook.numRows - 1; r++) {
            values.push(this.getAt(workbook, r, 5));
        }

        // Configure the chart, initiating the request from the charting service.
        self[chartSym].setConfiguration({
            layout: "Pie",
            legend: {
                position: {
                    edge: "Left",
                    edgePosition: "Middle",
                },
                title: {
                    position: {
                        edge: "Top",
                        edgePosition: "Middle",
                    },
                    text: "Player",
                },
            },
            series: [{
                data: {
                    categoryNames: categoryNames.reverse(),
                    values: values.reverse(),
                },
                id: "Series1",
            }],
            size: {
                height,
                width: Math.round(height * 1.618),        // ~= Golden ratio wrt. height
            },
        });

        return element;
    }

    /** Evaluates the cell at the given (row, col), coercing the result to a number | boolean | string. */
    private getAt(workbook: SharedWorkbook, row, col) {
        const result = workbook.evaluateCell(row, col);

        switch (result.kind) {
            case ResultKind.Success:
                switch (typeof result.value) {
                    case "number":
                    case "boolean":
                    case "string":
                        return result.value;
                    default:
                        return result.value.toString();
                }
            default:
                return result.reason.toString();
        }
    }
}
