/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLView, IRequest } from "@microsoft/fluid-component-core-interfaces";
import { RequestParser } from "@microsoft/fluid-container-runtime";
import { IComponentRuntime, IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { Todo, TodoName, TodoView } from "../Todo";
import { TodoItemView } from "../TodoItem";

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

export async function viewRequestHandler(request: IRequest, runtime: IHostRuntime) {
    const requestParser = new RequestParser(request);
    const pathParts = requestParser.pathParts;

    if (pathParts[0] === "TodoView") {
        const modelRequest = requestParser.createSubRequest(1);
        return TodoView.request(modelRequest, runtime);
    } else if (pathParts[0] === "TodoItemView") {
        const modelRequest = requestParser.createSubRequest(1);
        return TodoItemView.request(modelRequest, runtime);
    }
}
