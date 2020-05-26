/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import "react-grid-layout/css/styles.css";
import { SpacesStorageView } from "./storage";
import { SpacesToolbar } from "./spacesToolbar";
import { SpacesPrimedContext } from "./context";

/**
 * SpacesView is the full view of the Spaces component, including its toolbar and contained components.
 */
export const SpacesView: React.FC = () => {
    const {
        state,
        selector,
    } = React.useContext(SpacesPrimedContext);
    // Editable is a view-only concept; SpacesView is the authority.
    const [editable, setEditable] = React.useState<boolean>(state !== undefined
        && selector?.componentMap.function(state).result.size === 0);

    return (
        <div className="spaces-view">
            <SpacesToolbar
                editable={editable}
                setEditable={setEditable}
            />
            <SpacesStorageView editable={editable} />
        </div>
    );
};
