## Summarizable Object

A summarizable object is part of the summary but it does not generate any ops.

It must be set in response to a remote op and the sequence number of the op should be passed along with the data to be set. The object will be summarized with reference to the passed sequence number.