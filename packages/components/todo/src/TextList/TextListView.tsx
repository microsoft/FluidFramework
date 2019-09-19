/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDirectory, IDirectoryValueChanged, ISharedDirectory } from "@microsoft/fluid-map";
import { SharedString } from "@microsoft/fluid-sequence";
import { CollaborativeInput } from "@microsoft/fluid-aqueduct-react";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import React, { useEffect, useRef, useState } from "react";
import ReactList from "react-list";

interface ITextListViewProps {
    textDirectory: IDirectory;
    root: ISharedDirectory;
    createNewItem(): void;
}

/**
 * This is an example of using react hooks with listeners
 */
// tslint:disable-next-line: function-name
export function TextListView(props: ITextListViewProps) {
    const [sharedStrings, setSharedString] = useState<{id: string, text: SharedString}[]>([]);
    const sharedStringRef = useRef(sharedStrings);

    // We have a hook that we only want to run once. This will setup our listeners to modify our array of SharedStrings
    useEffect(() => {
        // useEffect is not an async call. This means we need to use a floating promise that does state set up
        const generateShareStringList = async () => {
            const newIds = [...props.textDirectory.keys()];
            const currentIds = sharedStringRef.current.map((x) => x.id);

            // Get SharedStrings for newly added items
            const sharedStringList: {id: string, text: SharedString}[] = [];
            const sharedStringsP: Promise<SharedString>[] = [];
            const addedItems = newIds.filter((x) => !currentIds.includes(x));
            addedItems.forEach(async (id) => {
                const sharedStringP = props.textDirectory.get<IComponentHandle>(id).get<SharedString>();
                sharedStringsP.push(sharedStringP);
                sharedStringList.push({
                    id,
                    text: await sharedStringP,
                });
            });

            // Remove items that were removed
            const currentItems = sharedStringRef.current.filter((x) => currentIds.includes(x.id));
            await Promise.all(sharedStringsP);

            setSharedString([...currentItems, ...sharedStringList]);
        };

        props.root.on("valueChanged", (changed: IDirectoryValueChanged) => {
            if (changed.path === props.textDirectory.absolutePath) {
                // Every time we get a new event we will re-get all the SharedStrings
                // tslint:disable-next-line: no-floating-promises
                generateShareStringList();
            }
        });

        // We want to generate this list the first time we render this but we need to do it in an async way
        // tslint:disable-next-line: no-floating-promises
        generateShareStringList();
    }, []);

    const deleteItem = (id: string) => {
        props.textDirectory.delete(id);
    };

    const renderItem = (index: number) => {
        const sharedString = sharedStrings[index];
        return (
            <div key={sharedString.id}>
                <CollaborativeInput sharedString={sharedString.text} />
                <button onClick={() => deleteItem(sharedString.id)}>x</button>
            </div>
        );
    };

    return (
        <div>
            <div>
                <button onClick={props.createNewItem}>+</button>
                <ReactList
                    itemRenderer={renderItem}
                    length={sharedStrings.length}
                    type="uniform"
                    minSize={sharedStrings.length}
                />
            </div>
        </div>
    );
}
