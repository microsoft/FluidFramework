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
    readonly className?: string;
}

export const TodoItemView: React.FC<TodoItemViewProps> = (props: TodoItemViewProps) => {
    const { todoItemModel, className } = props;
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
        <div className={`todo-item${ className !== undefined ? ` ${ className }` : ""}`}>
            <h2 className="todo-item-header">
                <input
                    type="checkbox"
                    className="todo-item-checkbox"
                    checked={checked}
                    onChange={checkChangedHandler} />
                <button
                    className="todo-item-expand-button"
                    name="toggleDetailsVisible"
                    onClick={ () => { setDetailsVisible(!detailsVisible); } }
                >{detailsVisible ? "▲" : "▼"}</button>
                <CollaborativeInput
                    sharedString={itemText}
                    className="todo-item-input"
                />
            </h2>
            {
                // The details can be shown or hidden
                detailsVisible &&
                <CollaborativeTextArea
                    className="todo-item-details"
                    sharedStringHelper={new SharedStringHelper(todoItemModel.getDetailedText())}
                />
            }
        </div>
    );
};
