import * as React from "react";
import Iframe from "react-iframe"

export class Analytics extends React.Component<{}, {}> {
    render() {
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