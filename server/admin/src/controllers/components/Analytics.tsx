/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import Iframe from "react-iframe";

export class Analytics extends React.Component<{}, {}> {
    public render() {
        return (
            <div>
                <h2 className="analytics-header">Analytics Dashboard</h2>
                <Iframe url="https://grafana.wu2.prague.office-int.com/dashboard/db/latency-summary?orgId=1"
                        position="absolute"
                        width="100%"
                        id="grafana"
                        height="100%"
                        allowFullScreen/>
            </div>
        );
    }
}
