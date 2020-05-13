/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultComponent,
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { pollOptionsMapKey, pollVotersMapKey } from "./Constants";
// eslint-disable-next-line import/no-internal-modules
import { Poll } from "./view/Poll";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
const chaincodeName = pkg.name;

export class Pollster extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    protected async componentInitializingFirstTime() {
        this.root.set(pollOptionsMapKey, SharedMap.create(this.runtime).handle);
        this.root.set(pollVotersMapKey, SharedMap.create(this.runtime).handle);
    }

    public async render(div: HTMLDivElement) {
        const optionsMap = await this.root.get<IComponentHandle<ISharedMap>>(pollOptionsMapKey).get();
        const votersMap = await this.root.get<IComponentHandle<ISharedMap>>(pollVotersMapKey).get();

        // Render Component
        ReactDOM.render(
            <Poll
                pollStore={{
                    rootMap: this.root,
                    optionsMap,
                    votersMap,
                }}
                clientId={this.runtime.clientId}
            />,
            div,
        );
    }
}

export const PollInstantiationFactory = new PrimedComponentFactory(
    chaincodeName,
    Pollster,
    [SharedMap.getFactory()],
    {},
);

export const fluidExport = new ContainerRuntimeFactoryWithDefaultComponent(
    chaincodeName,
    new Map([
        [chaincodeName, Promise.resolve(PollInstantiationFactory)],
    ]),
);
