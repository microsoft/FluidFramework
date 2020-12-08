/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { getTinyliciousContainer } from "@fluidframework/get-tinylicious-container";

import { KeyValueContainerRuntimeFactory } from "./containerCode";
import { IKeyValueDroplet } from "./dataObject";

let createNew = false;
if (location.hash.length === 0) {
    createNew = true;
    location.hash = Date.now().toString();
}
const documentId = location.hash.substring(1);
document.title = documentId;

// View

const DiceRollerView: React.FC<any> = (props) => {
    const [value, setValue] = React.useState(1);
    const dataKey = 'dataKey';

    React.useEffect(() => {
        const onChanged = () => {
            setValue(props.data.get(dataKey));
        };
        props.data.on("changed", onChanged);
        return () => {
            props.data.off("changed", onChanged);
        };
    }, [props.data]);

    // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
    const diceChar = String.fromCodePoint(0x267F + value);

    return (
        <div>
            <span style={{ fontSize: 50 }}>{diceChar}</span>
            <button onClick={() => props.data.set(dataKey, Math.floor(Math.random() * 6) + 1)}>Roll</button>
        </div>
    );
};

// Model
const div = document.getElementById("content") as HTMLDivElement;


const getKeyValueDb = async function(): Promise<IKeyValueDroplet> {

    const container = await getTinyliciousContainer(documentId, KeyValueContainerRuntimeFactory, createNew);

    const url = "/";
    const response = await container.request({ url });

    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        throw new Error(`Unable to retrieve data object at URL: "${url}"`);
    } else if (response.value === undefined) {
        throw new Error(`Empty response from URL: "${url}"`);
    }

    return response.value
};


getKeyValueDb().then((db) => {
    ReactDOM.render(
        <DiceRollerView data={db} />,
        div,
    );
})




