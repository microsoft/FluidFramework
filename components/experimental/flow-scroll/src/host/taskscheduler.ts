/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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
        const hostTokens = (this.componentContext.containerRuntime as IComponent).IComponentTokenProvider;
        const intelTokens = hostTokens && hostTokens.intelligence ? hostTokens.intelligence.textAnalytics : undefined;
        if (intelTokens?.key?.length > 0) {
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
        } else {
            console.log("No intel key provided.");
        }
    }
}
