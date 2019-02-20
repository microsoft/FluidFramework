import { ISharedMap } from "@prague/map";
import * as Sequence from "@prague/sequence";
import { resumeAnalytics, textAnalytics } from "./analytics" ;
import { IntelligentServicesManager } from "./serviceManager";

const textAnalyticsConfig = {
    key: "c8b60dc5e49849ce903d7d29a2dce550",
};

const resumeAnalyticsConfig = {
    deviceId: "routerlicious",
    host: "pkarimov-paidIOT.azure-devices.net",
    sharedAccessKey: "8mvOmNnUklwnuzY+U96V51w+qCq262ZUpSkdw8nTZ18=",
    sharedAccessKeyName: "iothubowner",
    url: "https://alfred.wu2-ppe.prague.office-int.com/intelligence/resume",
};

export class IntelRunner {
    private intelligenceManager: IntelligentServicesManager;

    constructor(private sharedString: Sequence.SharedString, private insightsMap: ISharedMap) {
    }

    public async start(): Promise<void> {
        await this.insightsMap.wait(this.sharedString.id);
        this.intelligenceManager = new IntelligentServicesManager(this.sharedString, this.insightsMap);
        this.intelligenceManager.registerService(textAnalytics.factory.create(textAnalyticsConfig));
        this.intelligenceManager.registerService(resumeAnalytics.factory.create(resumeAnalyticsConfig));
        this.intelligenceManager.process();
    }
}
