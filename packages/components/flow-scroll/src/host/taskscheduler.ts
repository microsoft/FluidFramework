import { IComponentContext, ITaskManager, ITask } from "@microsoft/fluid-runtime-definitions";
import { FlowDocument } from "@fluid-example/webflow";
import { SharedMap } from "@microsoft/fluid-map";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { TextAnalyzer } from "@fluid-example/flow-intel";

export class TaskScheduler {
    constructor(
        private readonly componentContext: IComponentContext,
        private readonly taskManager: ITaskManager,
        private readonly componentUrl: string,
        private readonly flowDocument: FlowDocument,
        private readonly insightsMap: SharedMap,
    ) {

    }

    public start() {
        const hostTokens = (this.componentContext.hostRuntime as IComponent).IComponentTokenProvider;
        const intelTokens = hostTokens && hostTokens.intelligence ? hostTokens.intelligence.textAnalytics : undefined;
        const intelTask: ITask = {
            id: "intel",
            instance: new TextAnalyzer(this.flowDocument, this.insightsMap, intelTokens),
        };
        this.taskManager.register(intelTask);
        this.taskManager.pick(this.componentUrl, "intel").then(() => {
            console.log(`Picked text analyzer`);
        }, (err) => {
            console.log(JSON.stringify(err));
        });
    }
}
