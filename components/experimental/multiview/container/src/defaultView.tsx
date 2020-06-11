/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";

interface IDefaultViewProps {
}

export const DefaultView: React.FC<IDefaultViewProps> = (props: IDefaultViewProps) => {
    return (
        <div>
            <div>
                Simple linking of a single model/view
            </div>
            <div>
                Sharing a model between views
            </div>
            <div>
                A view with two models
            </div>
            <div>
                A nested scenario
            </div>
            <div>
                An anonymous (nested?) scenario
            </div>
        </div>
    );
}
