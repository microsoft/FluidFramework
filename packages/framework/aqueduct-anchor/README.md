# Aqueduct Anchor

This package contains implementations of an anchor component that keeps track of container level information. It should be loaded when the container is loaded so that it can correctly track such information.
For example, it tracks the following:
 - The last user who edited this container.
 - The timestamp of the last time the container was edited.
 
 It listens to all the ops in the container and updates the tracking information. It uses a SummarizableObject to store this data because it wants the data to be part of the summary but it should not generate addition ops in the op listener.