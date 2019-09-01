/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from 'react';
import { DrawerCommandBar } from './drawerCommandBar';
import { DocumentList } from "./documentList";

export const App: React.FunctionComponent = () => {
    return (
        <div>
            <DrawerCommandBar />

            <DocumentList />
        </div>
    );
};
