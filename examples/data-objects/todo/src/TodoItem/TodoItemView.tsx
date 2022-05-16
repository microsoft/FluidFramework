/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput, CollaborativeTextArea, SharedStringHelper } from "@fluid-experimental/react-inputs";
import React, { useEffect, useState } from "react";
import { TodoItem } from "./TodoItem";

interface TodoItemViewProps {
    readonly todoItemModel: TodoItem;
    readonly getDirectLink: (itemId: string) => string;
}

const buttonStyle = {
    height: "25px",
    marginLeft: "2px",
    marginRight: "2px",
    width: "35px",
};

export const TodoItemView: React.FC<TodoItemViewProps> = (props: TodoItemViewProps) => {
    const { todoItemModel, getDirectLink } = props;
    const itemText = todoItemModel.getText();
    const [checked, setChecked] = useState<boolean>(todoItemModel.getCheckedState());
    const [detailsVisible, setDetailsVisible] = useState<boolean>(false);
    const itemId = todoItemModel.id;

    useEffect(() => {
        const refreshCheckedStateFromModel = () => {
            setChecked(todoItemModel.getCheckedState());
        };
        todoItemModel.on("checkedStateChanged", refreshCheckedStateFromModel);
        refreshCheckedStateFromModel();

        return () => {
            todoItemModel.off("checkedStateChanged", refreshCheckedStateFromModel);
        };
    }, [todoItemModel]);

    const checkChangedHandler = (e: React.ChangeEvent<HTMLInputElement>): void => {
        todoItemModel.setCheckedState(e.target.checked);
    };

    // TODO: Consider moving the action buttons to the TodoView?  Routing through Todo?
    return (
        <div className="todo-item">
            <h2>
                <input
                    type="checkbox"
                    name={todoItemModel.handle.absolutePath}
                    checked={checked}
                    onChange={checkChangedHandler} />
                <CollaborativeInput
                    sharedString={itemText}
                    style={{
                        border: "none",
                        fontFamily: "inherit",
                        fontSize: 20,
                        marginBottom: 5,
                        marginTop: 5,
                        outline: "none",
                        width: "inherit",
                    }} />
                <button
                    name="toggleInnerVisible"
                    style={buttonStyle}
                    onClick={() => {
                        setDetailsVisible(!detailsVisible);
                    }}>
                    {detailsVisible ? "▲" : "▼"}
                </button>
                <button
                    name="OpenSubComponent"
                    id={itemId}
                    style={buttonStyle}
                    onClick={() => window.open(getDirectLink(itemId), "_blank")}
                    disabled={itemId === undefined}>↗
                </button>
                <button
                    style={buttonStyle}
                    onClick={() => alert("Implement Delete")}>X</button>
            </h2>
            {
                // If the content is visible we will show a button or a component
                detailsVisible &&
                <CollaborativeTextArea
                    sharedStringHelper={new SharedStringHelper(todoItemModel.getDetailedText())}
                />
            }
        </div>
    );
};
