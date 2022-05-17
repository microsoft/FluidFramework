/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput, CollaborativeTextArea, SharedStringHelper } from "@fluid-experimental/react-inputs";
import React, { useEffect, useState } from "react";
import { TodoItem } from "./TodoItem";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

interface TodoItemViewProps {
    readonly todoItemModel: TodoItem;
}

export const TodoItemView: React.FC<TodoItemViewProps> = (props: TodoItemViewProps) => {
    const { todoItemModel } = props;
    const itemText = todoItemModel.getText();
    const [checked, setChecked] = useState<boolean>(todoItemModel.getCheckedState());
    const [detailsVisible, setDetailsVisible] = useState<boolean>(false);

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

    return (
        <div className="todo-item">
            <h2>
                <input
                    type="checkbox"
                    name={todoItemModel.handle.absolutePath}
                    checked={checked}
                    onChange={checkChangedHandler} />
                <span>{detailsVisible ? "▲" : "▼"}</span>
                <CollaborativeInput
                    sharedString={itemText}
                    className="collaborative-input"
                />
                <button
                    name="toggleDetailsVisible"
                    className="action-button"
                    onClick={() => {
                        setDetailsVisible(!detailsVisible);
                    }}>
                    {detailsVisible ? "▲" : "▼"}
                </button>
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
