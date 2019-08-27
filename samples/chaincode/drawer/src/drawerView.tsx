/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentHTMLOptions,
    IComponentHTMLView,
} from "@prague/component-core-interfaces";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { App } from "./app";

export class DrawerView implements IComponentHTMLView {
    constructor(public remove: () => void) {
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        ReactDOM.render(<App />, elm);
    }
}
