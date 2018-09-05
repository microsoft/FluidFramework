import { Box } from ".";
import { ResultKind } from "../../ext/calc";
import * as Charts from "../../ext/microsoft-charts/";
import { CollaborativeWorkbook } from "../calc";

// tslint:disable:no-empty-interface
export interface IChartState {}

/** Renders a worksheet as a chart using IvyCharts service. */
export class Chart extends Box<IChartState> {
    public get isParagraph() { return true; }       // Participate as a paragraph in FlowView.

    private readonly host = new Charts.Host({
        base: "https://charts.microsoft.com" });

    public measure(self: IChartState, services: Map<string, any>, font: string) {
        throw new Error("measure() currently unused in paragraph.");
        return NaN;
    }

    public render(self: IChartState, services: Map<string, any>) {
        // If the workbook is still loading, early exit with a placeholder message.
        const workbook = services.get("workbook");
        if (typeof workbook === "undefined") {
            const placeholder = document.createElement("div");
            placeholder.innerText = "[ Loading... ]";
            return placeholder;
        }

        // TODO: Component state should specify which region of the workbook contains
        //       category names.
        const categoryNames = [];
        for (let r = 0; r < workbook.numRows; r++) {
            categoryNames.push(this.getAt(workbook, r, 0));
        }

        // TODO: Component state should specify which region of the workbook contains
        //       the values for the chart.
        const values = [];
        for (let r = 0; r < workbook.numRows; r++) {
            values.push(this.getAt(workbook, r, 1));
        }

        // Create the div to which the Chart will attach the SVG rendered chart when the
        // web service responds.
        const div = document.createElement("div");

        // Explicitly set div height to match the chart that will asynchronously arrive from
        // the web service.  This reserves the appropriate amount of vertical space in the
        // FlowView, avoiding the need for a later invalidation/resize when the chart arrives.
        const height = 480;
        div.style.height = `${height}px`;

        // Configure the chart, initiating the request from the charting service.
        const chart = new Charts.Chart(this.host, div);
        chart.setRenderer(Charts.IvyRenderer.Svg);
        chart.setConfiguration({
            layout: "Bar Clustered",
            series: [{
                data: {
                    categoryNames,
                    values,
                },
                id: "Series1",
            }],
            size: {
                height,
                width: 768,
            },
        });

        return div;
    }

    /** Evaluates the cell at the given (row, col), coercing the result to a number | boolean | string. */
    private getAt(workbook: CollaborativeWorkbook, row, col) {
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
