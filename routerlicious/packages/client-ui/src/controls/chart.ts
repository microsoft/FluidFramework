import { types } from "@prague/client-api";
import * as ui from "../ui";

export class Chart extends ui.Component {
    private chart: any;
    private lastSize: ui.ISize = { width: -1, height: -1 };

    constructor(element: HTMLDivElement, private cell: types.ICell) {
        super(element);
        // tslint:disable-next-line:no-string-literal
        const Microsoft = typeof window !== "undefined" ? window["Microsoft"] : undefined;
        const DefaultHost = (Microsoft && Microsoft.Charts) ?
        new Microsoft.Charts.Host({ base: "https://charts.microsoft.com" }) : null;
        this.chart = new Microsoft.Charts.Chart(DefaultHost, element);
        this.chart.setRenderer(Microsoft.Charts.IvyRenderer.Svg);

        this.cell.on("valueChanged", () => {
            this.invalidateChart();
        });
    }

    protected resizeCore(rectangle: ui.Rectangle) {
        if (rectangle.width !== this.lastSize.width || rectangle.height !== this.lastSize.height) {
            this.lastSize.width = rectangle.width;
            this.lastSize.height = rectangle.height;
            this.invalidateChart();
        }
    }

    private async getChartConfiguration() {
        const config = await this.cell.get();
        if (!config) {
            return null;
        } else {
            const size = this.size.size;
            config.size = size;
            return config;
        }
    }

    private invalidateChart() {
        this.getChartConfiguration().then((config) => {
            if (config) {
                this.chart.setConfiguration(config);
            }
        });
    }
}
