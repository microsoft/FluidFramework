# Codec

This library defines types and constructs for organizing code that works with persisted data.
Its fundamental building block is a codec--a bit of code capable of transcoding between a stable format used for persistence and a potentially less stable format only used in memory.
Typically, for compatibility reasons, aspects of `SharedTree` should work with `ICodecFamily`s (which can do the above for multiple supported formats).

## JSON Validators

Codecs can define draft 6 JSON schema for their encoded data.

One policy choice is whether or not encoded data should be validated, and if so, how.
Since some `SharedTree` users might not want to pay the bundle-size cost to perform this validation in all environments,
this policy is injectable using `ICodecOptions` by providing a `JsonValidator`.

This package exports and runs encoding tests using `typeboxValidator`, but any JSON schema draft 6-compliant schema validator can be used.
