Lambda that processes only ops related to PropertyDDS.
From each op a changeSet extracted and submitted to Moira service.

For each PropertyDDS lambda will create a branch if it doesn't exist.
Later, all corresponding changeSets will committed to that branch.
