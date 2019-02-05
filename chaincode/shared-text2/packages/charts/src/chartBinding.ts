import {
    Chart,
    Host,
    IChartSettings,
    IvyRenderer,
} from "@ms/charts";
import * as ko from "knockout";

// The bound data passed to the binding
export interface IBoundData {
    host: Host;
    renderer: IvyRenderer;
    settings: IChartSettings;
}

export class IvyChartBindingHandler implements KnockoutBindingHandler {
    private chart: Chart = null;

    public init = (element, valueAccessor, allBindings, viewModel, bindingContext) => {
        const resource = ko.unwrap(valueAccessor()) as IBoundData;
        this.chart = new Chart(resource.host, element);
    }

    public update = (element: Element, valueAccessor, allBindings, viewModel, bindingContext) => {
        const resource = ko.unwrap(valueAccessor()) as IBoundData;
        this.chart.setRenderer(resource.renderer);
        this.chart.setConfiguration(resource.settings);
    }
}
