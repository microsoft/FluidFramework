/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentHTMLOptions,
    IComponentHTMLView,
} from "@prague/component-core-interfaces";
import { mergeStyles } from 'office-ui-fabric-react';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { App } from "./app";

// Inject some global styles
mergeStyles({
    selectors: {
        ':global(body), :global(html), :global(#app)': {
            margin: 0,
            padding: 0,
            height: '100vh'
        }
    }
});

export class DrawerView implements IComponentHTMLView {
    constructor(public remove: () => void) {
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        ReactDOM.render(<App />, elm);
    }
}
