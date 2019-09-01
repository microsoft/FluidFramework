/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from 'react';
import { DocumentCardBasicExample } from './card';

export class DocumentList extends React.Component<{}, {}> {
    public render(): JSX.Element {
        return (
            <div>
                <DocumentCardBasicExample />
            </div>
        );
    }
}
