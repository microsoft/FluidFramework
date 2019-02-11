import * as charts from "@ms/charts";
import { IPlatform, ITree } from "@prague/container-definitions";
import { IMapView, MapExtension } from "@prague/map";
import {
    ComponentHost,
} from "@prague/runtime";
import {
    IChaincode,
    IChaincodeComponent,
    IComponentDeltaHandler,
    IComponentPlatform,
    IComponentRuntime,
    IRuntime } from "@prague/runtime-definitions";
import { Deferred } from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";
import { Document } from "./document";
import * as explorer from "./explorer";

// tslint:disable:no-var-requires
const cloneDeep = require("lodash/cloneDeep");
// tslint:enable:no-var-requires

const defaultSettings = {
    layout: "Radar Filled",
    legend: {
            position: {
            edge: "Top",
            edgePosition: "Middle",
        },
        title: {
            position: {
              edge: "Top",
              edgePosition: "Middle",
            },
            text: "Legend Title",
        },
    },
    series: [
        {
            data: {
                values: [
                    69.14964017037771, 82.55589380290198, 77.7992589146683, 47.079431577865975,
                    61.0278147452978, 36.828990405761814, 71.27523285013173, 18.651273016245575,
                    94.25718643974449, 50.32715058212624],
            },
            id: "i0",
            layout: "Area Stacked (100%)|310E5127-9664-483E-B00D-43661237ED58",
            title: "Series 1",
        },
        {
            data: {
                values: [
                    52.2401034787816, 16.221559646645183, 44.47911083227592, 49.707334744306294,
                    84.95812020684563, 49.01542136996819, 18.300268885128506, 66.53927309022224,
                    45.52806497921968, 57.46258907835091],
            },
            id: "i1",
            layout: "Area Stacked (100%)|310E5127-9664-483E-B00D-43661237ED58",
            title: "Series 2",
        },
        {
            data: {
                values: [
                    64.047312897452, 53.93685241137547, 78.53195036625438, 63.12685058974058,
                    50.187516638835014, 43.90329745514665, 94.0725396345816, 21.108326963613084,
                    32.72517345245099, 62.40440012954861],
            },
            id: "i2",
            layout: "Area Stacked (100%)|310E5127-9664-483E-B00D-43661237ED58",
            title: "Series 3",
        },
    ],
    size: {
        height: 480,
        width: 768,
    },
    title: {
            position: {
            edge: "Top",
            edgePosition: "Middle",
        },
        text: "Chart Title",
    },
};

const dts = `
declare interface IMap {
    get<T = any>(key: string): Promise<T>;
    set<T = any>(key: string, value: T | any): T;
}
`;

class ChartRunner extends EventEmitter implements IPlatform {
    private deferred = new Deferred<{ collabDoc: Document, rootView: IMapView }>();

    public async run(runtime: IRuntime, platform: IPlatform) {
        this.initialize(runtime).then(
            (doc) => this.deferred.resolve(doc),
            (error) => this.deferred.reject(error));
        return this;
    }

    public async queryInterface<T>(id: string): Promise<any> {
        const details = await this.deferred.promise;

        switch (id) {
            case "root":
                return { entry: await details.collabDoc.getRoot(), type: "IMap" };
            case "dts":
                return dts;
            default:
                return null;
        }
    }

    public async attach(platform: IComponentPlatform): Promise<IComponentPlatform> {
        console.log("Chart attach");
        const details = await this.deferred.promise;

        const hostContent: HTMLElement = await platform.queryInterface<HTMLElement>("div");
        if (!hostContent) {
            // If headless exist early
            return;
        }

        const content = document.createElement("div");
        hostContent.appendChild(content);

        if (hostContent.id === "content") {
            explorer.initialize(details.rootView, "https://charts.microsoft.com", content);
        } else {
            this.renderChart(details.collabDoc, content, details.rootView);
        }
    }

    private async initialize(runtime: IRuntime) {
        const collabDoc = await Document.Load(runtime);

        const rootView = await collabDoc.getRoot().getView();
        if (!collabDoc.existing) {
            rootView.set("chart", defaultSettings);
        } else {
            await rootView.wait("chart");
        }

        // TODO need to emit connected on new component code
        // Wait for connection to get latest data
        // if (!runtime.connected) {
        //     await new Promise<void>((resolve) => runtime.once("connected", () => resolve()));
        // }

        return { collabDoc, rootView };
    }

    private renderChart(collabDoc: Document, content: HTMLDivElement, rootView: IMapView) {
        const host = new charts.Host({ base: "https://charts.microsoft.com" });
        const chart = new charts.Chart(host, content);
        chart.setRenderer(charts.IvyRenderer.Svg);

        this.setChartConfiguration(chart, rootView.get("chart"));
        collabDoc.getRoot().on("valueChanged", (key) => {
            this.setChartConfiguration(chart, rootView.get("chart"));
        });
    }

    private setChartConfiguration(chart: charts.Chart, settings: charts.IChartSettings) {
        settings = cloneDeep(settings);

        // update baseConfig w/ data
        chart.setConfiguration(settings);
    }
}

class Chaincode extends EventEmitter implements IChaincode {
    private modules = new Map<string, any>();

    /**
     * Constructs a new document from the provided details
     */
    constructor(private runner: any) {
        super();

        this.modules.set(MapExtension.Type, new MapExtension());
    }

    public getModule(type: string): any {
        assert(this.modules.has(type));
        return this.modules.get(type);
    }

    /**
     * Stops the instantiated chaincode from running
     */
    public close(): Promise<void> {
        return Promise.resolve();
    }

    public async run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform> {
        return this.runner.run(runtime, platform);
    }
}

/**
 * A document is a collection of collaborative types.
 */
export class ChartComponent implements IChaincodeComponent {
    private chart = new ChartRunner();
    private chaincode: Chaincode;
    private component: ComponentHost;

    constructor() {
        this.chaincode = new Chaincode(this.chart);
    }

    public getModule(type: string) {
        return null;
    }

    public async close(): Promise<void> {
        return;
    }

    public async run(runtime: IComponentRuntime, platform: IPlatform): Promise<IComponentDeltaHandler> {
        const chaincode = this.chaincode;

        // All of the below would be hidden from a developer
        // Is this an await or does it just go?
        const component = await ComponentHost.LoadFromSnapshot(
            runtime,
            runtime.tenantId,
            runtime.documentId,
            runtime.id,
            runtime.parentBranch,
            runtime.existing,
            runtime.options,
            runtime.clientId,
            runtime.user,
            runtime.blobManager,
            runtime.baseSnapshot,
            chaincode,
            runtime.deltaManager,
            runtime.getQuorum(),
            runtime.storage,
            runtime.connectionState,
            runtime.branch,
            runtime.minimumSequenceNumber,
            runtime.snapshotFn,
            runtime.closeFn);
        this.component = component;

        return component;
    }

    public async attach(platform: IComponentPlatform): Promise<IComponentPlatform> {
        return this.chart.attach(platform);
    }

    public snapshot(): ITree {
        const entries = this.component.snapshotInternal();
        return { entries };
    }
}
