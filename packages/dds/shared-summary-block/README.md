# @fluidframework/shared-summary-block

SharedSummaryBlock is a DDS that does not generate ops but is part of the summary. The name block comes from the fact that the data in this object is shared across clients only via summary blocks.
The data on this object must only be set in response to a remote op. Basically, if we replay same ops, the set of calls on this object to set data should be the same. This is critical because it does not generate ops of its own, but relies on the above principle to maintain eventual consistency and to summarize.
