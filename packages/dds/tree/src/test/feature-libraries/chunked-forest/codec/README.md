# Chunked Forest Codec Tests

Ideally we try and have unit tests correspond one to one with implementation logic, and keep dependencies of the tests minimal, ideally gut to the code its testing and its existing dependencies.
For this case that would mean encode tests testing encoding, and decode tests testing decoding.
This does not cover the use of round trip testing which uses both encode and decode.
Since round trip testing which is low cost and high value it is worth including even if it adds a less than ideal test dependency.
However its still nice to avoid a logical dependency cycle when including tests, so we want to avoid having both sets of tests depend on both sets of functionality:
this would make it unclear what tests should live where, and where to start debugging when there are multiple errors.
To mitigate this, round trip tests are only being included with the encoding tests.
Doing round trip tests as part of encode is preferred since there are many ways to encode a tree with differing compression, but one way to decode a tree: this means its easier to get full coverage of round trip cases by packing them with encode.
