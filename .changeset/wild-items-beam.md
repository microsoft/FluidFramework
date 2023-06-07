---
"@fluidframework/telemetry-utils": major
---

The internal logger interface used when instrumenting the code now supports logging a flat object,
which will be JSON.stringified before being sent to the host's base logger.
This is technically a breaking change but based on typical logger configuration, should not require any changes to accommodate.
