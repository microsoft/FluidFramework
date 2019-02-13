import * as charts from "@ms/charts";
import * as ederaExtensions from "@ms/charts-extensions";
import { ISharedMap } from "@prague/map";
import * as ko from "knockout";
import * as chartBinding from "./chartBinding";
import * as utils from "./utils";

class ViewModel {
    public error = ko.observable(false);
    public template: KnockoutComputed<string>;
    public loading = ko.observable(true);
    public extensions = ko.observable<charts.IExtensionsResource>(null);

    public mapDataBind: KnockoutObservable<string>;

    public endpoints = utils.AllEndpoints;
    public endpoint = ko.observable(this.endpoints[0]);

    public edges = ["Left", "Top", "Right", "Bottom"];
    public positions = ["Minimum", "Middle", "Maximum"];

    public hasChartTitle: KnockoutObservable<boolean>;
    public chartTitleText: KnockoutObservable<string>;
    public chartTitleEdge: KnockoutObservable<string>;
    public chartTitlePosition: KnockoutObservable<string>;

    public numDataPoints = ko.observable(10);
    public numSeries = ko.observable(3);

    public hasLegend: KnockoutObservable<boolean>;
    public hasLegendTitle: KnockoutObservable<boolean>;
    public legendTitleEdge: KnockoutObservable<string>;
    public legendTitlePosition: KnockoutObservable<string>;
    public legendTitleText: KnockoutObservable<string>;
    public legendEdge: KnockoutObservable<string>;
    public legendPosition: KnockoutObservable<string>;

    public width: KnockoutObservable<number>;
    public height: KnockoutObservable<number>;

    public layouts: KnockoutComputed<string[]>;
    public seriesLayout: KnockoutObservable<string>;

    public generatedData: KnockoutComputed<charts.ISeries[]>;

    public generatedChart: KnockoutComputed<chartBinding.IBoundData>;

    /**
     * Constructs a new ViewModel for the explorer page. Taking in the host to use as well
     * as an optional default layout.
     */
    constructor(private host: charts.Host, private view: ISharedMap) {
        const extensionsP = new Promise<charts.IExtensionsResource>((resolve, reject) => {
            host.getExtensions((error, extensions) => error ? reject(error) : resolve(extensions));
        });

        const settings = view.get("chart") as charts.IChartSettings;

        this.template = ko.computed(() => {
            return this.error()
                ? "error-template"
                : (this.loading() ? "loading-template" : "chart-template");
        });

        this.mapDataBind = ko.observable(view.get("bind") as string);

        this.hasChartTitle = ko.observable(!!settings.title);
        this.chartTitleText = ko.observable(settings.title ? settings.title.text : "Chart Title");
        this.chartTitleEdge = ko.observable(settings.title ? settings.title.position.edge : this.edges[1]);
        this.chartTitlePosition = ko.observable(
            settings.title ? settings.title.position.edgePosition : this.positions[1]);

        this.numDataPoints = ko.observable(10);
        this.numSeries = ko.observable(3);

        this.hasLegend = ko.observable(!!settings.legend);
        this.legendEdge = ko.observable(settings.legend ? settings.legend.position.edge : this.edges[1]);
        this.legendPosition = ko.observable(
            settings.legend ? settings.legend.position.edgePosition : this.positions[1]);

        const hasLegendTitle = settings.legend ? !!settings.legend.title : false;
        this.hasLegendTitle = ko.observable(hasLegendTitle);
        this.legendTitleEdge = ko.observable(hasLegendTitle ? settings.legend.title.position.edge : this.edges[1]);
        this.legendTitlePosition = ko.observable(
            hasLegendTitle ? settings.legend.title.position.edgePosition :  this.positions[1]);
        this.legendTitleText = ko.observable(hasLegendTitle ? settings.legend.title.text : "Legend Title");

        this.width = ko.observable(settings.size.width);
        this.height = ko.observable(settings.size.height);

        this.layouts = ko.computed<string[]>(() => {
            const extensions = this.extensions();
            return extensions ? extensions.seriesLayoutDefinitions.map((layout) => layout.id.split("|")[0]) : [];
        });
        this.seriesLayout = ko.observable<string>(settings.layout);

        this.layouts = ko.computed<string[]>(() => {
            const extensions = this.extensions();
            return extensions ? extensions.seriesLayoutDefinitions.map((layout) => layout.id.split("|")[0]) : [];
        });

        this.generatedData = ko.computed<charts.ISeries[]>(() => {
            const extensions = this.extensions();
            const selectedLayout = this.seriesLayout();

            if (!extensions) {
                return null;
            }

            // Get the full name of the selected layout
            let resource: charts.ISeriesLayoutDefinitionResource;
            for (const extension of extensions.seriesLayoutDefinitions) {
                if (selectedLayout === extension.id.split("|")[0]) {
                    resource = extension;
                    break;
                }
            }

            const chartDataBuilder = new ederaExtensions.ChartDataBuilder();
            const numSeries = this.numSeries();
            const numDataPoints = this.numDataPoints();

            return chartDataBuilder.generate(resource, numSeries, numDataPoints);
        });

        this.generatedChart = ko.computed<chartBinding.IBoundData>(() => {
            const data = this.generatedData();

            // Generate the chart title
            let title: charts.IChartTitle;
            if (this.hasChartTitle()) {
                title = {
                    position: {
                        edge: this.chartTitleEdge(),
                        edgePosition: this.chartTitlePosition(),
                        options: [charts.ChartChildPositionOptions[charts.ChartChildPositionOptions.None]],
                    },
                    text: this.chartTitleText(),
                };
            }

            // Generate the legend position
            let legend: charts.ILegend;
            if (this.hasLegend()) {
                let legendTitle: charts.ILegendTitle;
                if (this.hasLegendTitle()) {
                    legendTitle = {
                        position: {
                            edge: this.legendTitleEdge(),
                            edgePosition: this.legendTitlePosition(),
                        },
                        text: this.legendTitleText(),
                    };
                }

                legend = {
                    position: {
                        edge: this.legendEdge(),
                        edgePosition: this.legendPosition(),
                        options: [charts.ChartChildPositionOptions[charts.ChartChildPositionOptions.None]],
                    },
                    title: legendTitle,
                };
            }

            // Popualte the full settings
            const updatedSettings: charts.IChartSettings = {
                legend,
                series: data,
                size: {
                    height: this.height(),
                    width: this.width(),
                },
                title,
            };

            this.view.set("chart", updatedSettings);
            if (this.view.get("bind") !== this.mapDataBind()) {
                this.view.set("bind", this.mapDataBind());
            }

            return {
                host: this.host,
                renderer: utils.getRendererForEndpoint(this.endpoint()),
                settings: updatedSettings,
            };
        });

        // Update bound values once the extensions arrive
        extensionsP.then((extensions) => {
                this.extensions(extensions);
                this.loading(false);
            },
            (error) => {
                this.error(true);
            });
    }
}

// Initializes the controller making use of the provided base URL
export function initialize(
    view: ISharedMap,
    base: string,
    div: HTMLDivElement) {

    // tslint:disable:no-var-requires
    const template = require("../templates/explorer.html");
    require("../templates/style.css");
    require("bootstrap/dist/css/bootstrap.min.css");
    // tslint:enable:no-var-requires

    div.innerHTML = template;
    ko.bindingHandlers.chart = new chartBinding.IvyChartBindingHandler();
    const host = new charts.Host({ base });
    const viewModel = new ViewModel(host, view);
    ko.applyBindings(viewModel, div);
}
