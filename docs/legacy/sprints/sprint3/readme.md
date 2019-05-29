# Sprint 3

Sprint 3 will extend upon and showcase the infrastructure that was built during Sprint 2.

In sprint 2 we designed and implemented the merge tree instruction set that allows us to reach feature parity with Office.
We updated our storage model to be backed by Git. Giving us naming of all versions of a document as well as the ability
to branch and fork. Our intelligent service infrastructure was updated to be able to run on the client or the server. We 
added more intelligent services (spell checking) and updating our data types to support them. And we adopted Kubernetes
and Helm for service deployment.

These were major infrastructure updates but weren't always user visibile. Sprint 3 will further extend upon this infrastructure
but also more visibily expose it to users. We will take the merge tree instruction set and use it to build tables and
other rich text features. We will extend our branch/merge infrastructure to enable online, continuous integration merges
as well as offline merges. In doing so we will also build and explore the "higher plane" including a new set of intelligent
services that run on it and the combining of our text and ink canvases. We will build new data types (sets, counters, mutexes) on top of our underlying distributive data types. And will focus on engineering excellence by adding a robust set of stress, unit,
integration, and performance tests.

This sprint will run from September to the end of October.

## Investigation Areas

### Rich Text

The document virtual machine instructions are in place to support rich text. In sprint 3 we will do the UI side of the work to expose rich text features like tables and text formatting to the user.

### Advanced Collaborative Object Primitives

The system currently supports sequences, maps, and append-only queues. But in building out various features we have realized certain other data structures will be helpful. We will build out things such as a shared counter, set, and mutexes.

### Branching and Merging

A key component of our log based data structure, and our choice of git for storage, was the ability to be able to branch and merge at any point in the data stream. We will turn this into reality in sprint 3 and allow you to both merge an offline document back in to the live document. As well as do a live merge from a document you have branched from but still wish to see changes on.

### Higher Plane Intelligence

In support of the higher plane we will need intelligence to map from user gestures to intent. An example is circling or highlighting a section of text. And being able to map from the ink gesture to the text it applies to.

### Combined Ink and Rich Text Canvas

Our ink canvas currently represents a flex container. And the rich text the flow container. We want to unify the two and be able to ink within a flow container. As well as have flow containers within the flex container.

### ML for Word Layout Parity

As we add in rich text features we will want to validate we can be Word compatible in our print layouts. We believe we can utilize ML to simplify this process and provide a strong tool for all of Office. We will beging to investigate training a ML agent to be able to do fuzzy matches between a Word layout and our layout. And then have it tune parameters in order to optimize the fit.

### Engineering Excellence

We will continue to increase the stability of the system as we look to start self hosting in sprint 4. We will add in alerts to our logging system, increase our code coverage, and add in automated integration, performance, and load testing.

## Entry Statistics

### Code Coverage

Branches
14.73%
495/3,360

Lines
14.69%
1,309/8,911
