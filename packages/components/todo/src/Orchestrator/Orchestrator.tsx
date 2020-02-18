/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLView } from "@microsoft/fluid-component-core-interfaces";
import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { Todo, TodoName, TodoView } from "../Todo";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../../package.json");
export const OrchestratorName = `${pkg.name as string}-orchestrator`;

const todoId = "TodoId";

/**
 * Todo base component.
 * Visually contains the following:
 * - New todo item entry
 * - List of todo items
 */
export class Orchestrator extends PrimedComponent implements IComponentHTMLView {
    private todoComponent: Todo;

    public get IComponentHTMLView() { return this; }

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        // Create a new todo item
        const componentRuntime: IComponentRuntime = await this.context.createComponent(TodoName);
        await componentRuntime.request({ url: "/" });
        componentRuntime.attach();

        // Store the id of the component in our ids map so we can reference it later
        this.root.set(todoId, componentRuntime.id);
    }

    protected async componentHasInitialized() {
        this.todoComponent = await this.getComponent<Todo>(this.root.get(todoId));
    }

    // Start IComponentHTMLView

    /**
     * Creates a new view for a caller that doesn't directly support React
     */
    public render(div: HTMLElement) {
        ReactDOM.render(<TodoView todoModel={this.todoComponent}/>, div);
    }

    // End IComponentHTMLView
}
