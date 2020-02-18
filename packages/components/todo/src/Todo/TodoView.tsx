/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@microsoft/fluid-aqueduct-react";
import { IComponentHTMLView, IRequest } from "@microsoft/fluid-component-core-interfaces";
import { ContainerRuntime, RequestParser } from "@microsoft/fluid-container-runtime";
import { SharedString } from "@microsoft/fluid-sequence";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { TodoItem } from "../TodoItem/TodoItem";
import { TodoItemView } from "../TodoItem/TodoItemView";
import { Todo } from "./Todo";

interface TodoViewProps {
    todoModel: Todo;
}

interface TodoViewState {
    todoItemComponents: TodoItem[];
    modelLoaded: boolean;
}

export async function todoViewRequestHandler(request: IRequest, runtime: ContainerRuntime) {
    const requestParser = new RequestParser(request);
    const pathParts = requestParser.pathParts;
    if (pathParts[0] !== "TodoView") {
        return undefined;
    }

    const modelRequest = requestParser.createSubRequest(1);
    const todoModel = (await runtime.request(modelRequest)).value as Todo;
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const todoView = new TodoView({ todoModel });
    return { status: 200, mimeType: "fluid/component", value: todoView };
}

function getView(todoModel: Todo) {
    const view = {
        render: (elm: HTMLElement) => {
            ReactDOM.render(<TodoView todoModel={ todoModel }/>, elm);
        },
        IComponentHTMLView: undefined,
    };
    view.IComponentHTMLView = view;
    return view;
}

export class TodoView extends React.Component<TodoViewProps, TodoViewState> implements IComponentHTMLView {
    public get IComponentHTMLView() { return this.view; }
    private newTextInput: HTMLInputElement;
    private titleString: SharedString;
    private readonly view: IComponentHTMLView;

    constructor(props: TodoViewProps) {
        super(props);

        this.state = {
            todoItemComponents: [],
            modelLoaded: false,
        };

        this.createNewTodoItem = this.createNewTodoItem.bind(this);
        this.refreshTodoItemListFromModel = this.refreshTodoItemListFromModel.bind(this);

        this.view = getView(this.props.todoModel);
    }

    public async componentDidMount() {
        // Get the shared string for the title off the model
        this.titleString = await this.props.todoModel.getTodoTitleString();

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.props.todoModel.on("todoItemsChanged", async () => {
            // Doesn't really matter if we await this?
            await this.refreshTodoItemListFromModel();
        });

        // Wait for all the todo items to load, then declare the model loaded so we can render later
        // This approach waits for all todo items to load before rendering, but a more aggressive
        // approach might declare the model loaded before loading the items (since they aren't strictly
        // required in our render()) and allow the todo items to render as they come in.
        await this.refreshTodoItemListFromModel();
        this.setState({ modelLoaded: true });

        // Set focus to the text input
        this.newTextInput.focus();
    }

    private async refreshTodoItemListFromModel(): Promise<void> {
        const todoItemComponents = await this.props.todoModel.getTodoItemComponents();
        this.setState({ todoItemComponents });
    }

    /**
     * This allows us to prevent default form behavior while getting all the benefits
     */
    public async createNewTodoItem(ev: React.FormEvent<HTMLFormElement>): Promise<void> {
        ev.preventDefault();
        await this.props.todoModel.addTodoItemComponent({
            startingText: this.newTextInput.value,
            baseUrl: window.location.href,
        });
        this.newTextInput.value = "";
    }

    public render(): JSX.Element {
        // Getting the subcomponents and DDSs is async and happens after the first render in componentDidMount.
        // Until those finish loading, we'll render a loading indicator.
        if (!this.state.modelLoaded) {
            return <div>Loading...</div>;
        }

        // Using the list of TodoItem components, make a list of TodoItemViews.  We know they're available because
        // this.state.modelLoaded is true.
        const todoItemComponents = this.state.todoItemComponents.map((todoItemComponent) => (
            <TodoItemView
                todoItemModel={todoItemComponent}
                key={todoItemComponent.url}
            />
        ));

        // TodoView is made up of an editable title input, an input/button for submitting new items, and the list
        // of TodoItemViews.
        return (
            <div className="todo-view">
                <CollaborativeInput
                    className="todo-title"
                    sharedString={this.titleString}
                    style={{
                        border: "none",
                        fontFamily: "inherit",
                        fontSize: 30,
                        marginBottom: 5,
                        marginTop: 5,
                        outline: "none",
                        width: "inherit",
                    }}
                />
                <form onSubmit={this.createNewTodoItem}>
                    <input
                        type="text"
                        ref={(input) => { this.newTextInput = input; }} />
                    <button type="submit">+</button>
                </form>
                <div className="todo-item-list">
                    {todoItemComponents}
                </div>
            </div>
        );
    }
}
