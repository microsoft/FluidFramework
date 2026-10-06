---
"@fluidframework/tree": minor
"__section": tree
---
Preserve tagged diagnostics when reporting sandbox session errors

Sandbox session errors retain their original cause and tagged telemetry properties.
Failure notifications include a validated classification code and separate protocol-only and sensitive diagnostic fields.
The Host tags protocol-only text received from the Guest as `SandboxGuestData`, and sensitive text as `UserData`.
Applications that use the Guest as a security boundary must treat this tag as untrusted, potentially sensitive data.
The Host does not send sensitive diagnostics to the Guest.
Unknown error messages are not included in the telemetry-safe session error message.
