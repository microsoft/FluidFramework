---
"@fluidframework/routerlicious-driver": major
---

We are updating the client to adjust the behavior of the routerlicious driver during the first summary, which will now allow non-UTF-8 compatible binaries to be submitted. To support this change, it is necessary for the servers to run the latest versions that are prepared to work with this new format.

When uploading summaries, the SummaryTreeUploadManager and WholeSummaryUploadManager currently use different conversion types based on the content of the ISummaryTree object. If the content is binary, the encoding is base64, and if it comes from a string, the encoding is utf-8. Previously, there was an exception for the first summary, which was always encoded in utf-8. However, recent changes have adjusted the server code to replicate this processing for all summaries. As a result, new clients will need to be run against recent versions of the servers that understand this new format.
