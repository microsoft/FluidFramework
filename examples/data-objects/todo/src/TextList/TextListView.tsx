/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@fluid-experimental/react-inputs";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IDirectory } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import React, { useEffect, useRef, useState } from "react";

interface ITextListViewProps {
    textDirectory: IDirectory;
    createNewItem(): void;
}

/**
 * This is an example of using react hooks with listeners
 */
export function TextListView(props: ITextListViewProps) {
    const [sharedStrings, setSharedStrings] = useState<{ id: string; text: SharedString; }[]>([]);
    const sharedStringRef = useRef(sharedStrings);

    // We have a hook that we only want to run once. This will setup our listeners to modify our array of SharedStrings
    useEffect(() => {
        // The useEffect hook is not an async call. This means we need to use a floating promise that does state set up
        const generateShareStringList = async () => {
            const newIds = [...props.textDirectory.keys()];
            const currentIds = sharedStringRef.current.map((x) => x.id);

            // Get SharedStrings for newly added items
            const sharedStringList: { id: string; text: SharedString; }[] = [];
            const sharedStringsP: Promise<SharedString>[] = [];
            const addedItems = newIds.filter((x) => !currentIds.includes(x));
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            addedItems.forEach(async (id) => {
                const sharedStringP = props.textDirectory.get<IFluidHandle<SharedString>>(id).get();
                sharedStringsP.push(sharedStringP);
                sharedStringList.push({
                    id,
                    text: await sharedStringP,
                });
            });

            // Remove items that were removed
            const currentItems = sharedStringRef.current.filter((x) => currentIds.includes(x.id));
            await Promise.all(sharedStringsP);

            setSharedStrings([...currentItems, ...sharedStringList]);
        };

        // Every time we get a new event we will re-get all the SharedStrings
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        props.textDirectory.on("containedValueChanged", generateShareStringList);

        // We want to generate this list the first time we render this but we need to do it in an async way
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        generateShareStringList();
    }, []);

    const deleteItem = (id: string) => {
        props.textDirectory.delete(id);
    };

    const sharedStringItems = sharedStrings.map((sharedString) => (
        <div key={sharedString.id} className="text-item">
            <CollaborativeInput sharedString={sharedString.text} />
            <button onClick={() => deleteItem(sharedString.id)}>x</button>
        </div>
    ));

    return (
        <div className="text-list">
            <button onClick={props.createNewItem}>+</button>
            {sharedStringItems}
        </div>
    );
}
