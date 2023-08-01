/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { Body1, Body1Strong, Subtitle1 } from "@fluentui/react-components";
import { DynamicComposedChart } from "./graphs";

/**
 * Page that shows op latency metrics.
 * @remarks TODO: Once Op Latency telemetry is available from {@link messageRelay}, the op latency data should be passed into the graph instead of this test data set.
 */
export function OpLatencyView(): React.ReactElement {
	return (
		<div style={{ width: "100%", height: "300px" }} data-testid="test-op-latency-view">
			<h3>Op Latency</h3>
			<DynamicComposedChart
				margin={{
					top: 15,
					right: 30,
					left: -15,
					bottom: 40,
				}}
				legendStyle={{
					marginLeft: 25,
					bottom: -5,
				}}
				// NOTE: Because Op Latency Telemetry is not yet available, this is a placeholder
				dataSets={[]}
			/>
			<div style={{ marginTop: "15px" }}>
				<div style={{ display: "flex", flexDirection: "column" }}>
					<Subtitle1>About</Subtitle1>
					<Body1>
						{`This Graph shows Fluid Op Latency metrics.
					As your make changes to your collaborative application, you'll see this graph update in real time with latency data.`}
						&nbsp;
						<a
							target="_blank"
							rel="noreferrer"
							href="https://fluidframework.com/docs/concepts/tob/"
						>
							{`Learn more about ops.`}
						</a>
					</Body1>
				</div>

				<div style={{ marginTop: "15px" }}>
					<Body1Strong>{`Op's in Fluid go through four phases:`}</Body1Strong>
					<ol>
						<li>
							<Body1>Op is added to DeltaManager (DM) buffer.</Body1>
						</li>
						<li>
							<Body1>
								Op is sent to service (op leaves outbound queue). Note: We do not
								know for sure when op is sent, we only track when it is added to
								outbound queue.
							</Body1>
						</li>
						<li>
							<Body1>Op received from service back (pushed to inbound queue).</Body1>
						</li>
						<li>
							<Body1>Op is processed.</Body1>
						</li>
					</ol>
				</div>
				<Body1Strong>
					With the following four phases in mind, these are the definitions for the
					metrics:
				</Body1Strong>
				<ol>
					<li>
						<div style={{ display: "flex", flexDirection: "row" }}>
							<Body1Strong>{`Duration Outbound:`}&nbsp;</Body1Strong>
							<Body1>{`Measure time between (1) and (2). The time the outbound op is sitting in queue due to active batch`}</Body1>
						</div>
					</li>
					<li>
						<div style={{ display: "flex", flexDirection: "row" }}>
							<Body1Strong>{`Duration Inbound:`}&nbsp;</Body1Strong>
							<Body1>{`Length of the DeltaManager's inbound queue at the time of the DM's inbound "push" event (3)`}</Body1>
						</div>
					</li>
					<li>
						<div style={{ display: "flex", flexDirection: "row" }}>
							<Body1Strong>{`Duration Network:`}&nbsp;</Body1Strong>
							<Body1>{`Measure time between (2) and (3) - Track how long it took for op to be acked by service`}</Body1>
						</div>
					</li>
				</ol>
			</div>
		</div>
	);
}
