import * as api from "../api";
import * as ui from "../ui";

// tslint:disable-next-line:no-string-literal
const Microsoft = typeof window !== "undefined" ? window["Microsoft"] : undefined;
export const DefaultHost = Microsoft ? new Microsoft.Charts.Host({ base: "https://charts.microsoft.com" }) : null;

export class Chart extends ui.Component {
    private chart: any;

    constructor(element: HTMLDivElement, private cell: api.ICell, host = DefaultHost) {
        super(element);
        this.chart = new Microsoft.Charts.Chart(host, element);
        this.chart.setRenderer(Microsoft.Charts.IvyRenderer.Svg);

        this.cell.on("valueChanged", () => {
            this.updateChart();
        });
    }

    protected resizeCore(rectangle: ui.Rectangle) {
        this.updateChart();
    }

    private async getChartConfiguration() {
        const config = await this.cell.get();
        const size = this.size.size;
        config.size = size;

        return config;
    }

    private updateChart() {
        this.getChartConfiguration().then((config) => {
            this.chart.setConfiguration(config);
        });
    }
}
