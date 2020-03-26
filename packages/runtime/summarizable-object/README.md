## Summarizable Object

A summarizable object is part of the summary but it does not generate any ops.

The data on this object should only be set in response to a remote op. The sequence number of the remote op should be passed along with the data to be set. The object will be summarized with reference to that sequence number.