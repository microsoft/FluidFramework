---
"@fluidframework/container-runtime": minor
---
---
"section": other
---

Reformat Signal telemetry events details

Properties of `eventName`s beginning "fluid:telemetry:ContainerRuntime:Signal" are updated to use `details` for all event specific information. Additional per-event changes:
- SignalLatency: shorten names now that data is packed into details. Renames:
   - `signalsSent` -> `sent`
   - `signalsLost` -> `lost`
   - `outOfOrderSignals` -> `outOfOrder`
- SignalLost/SignalOutOfOrder: rename `trackingSequenceNumber` to `expectedSequenceNumber`
- SignalOutOfOrder: rename `type` to `contentsType` and only emit it some of the time

Reminder: Naming and structure of telemetry events are not considered a part of API and may change at any time.
