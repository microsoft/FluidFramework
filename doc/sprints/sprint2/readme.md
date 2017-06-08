# Sprint 2

In sprint 2 we will build upon the success of our first broad demo. We will continue to build, understand, and
investigate the creation of distributred data structures as well as the backend systems needed to support them,
continue building and integrating intelligent services into our augmentation loop, and explore the usage of git as a
means to store interactive documents.

The sprint will run from June to August.

## Investigation areas

### Rich text

The previous sprint ended with a distributed string. In sprint 2 we will extend it to include rich text formatting. As
well as tackle some of the tricky collaborative edge cases as defined by our partner teams in Office.

### Service scalability and robustness

The service can currently handle ~2,000 ops/second on a document. But our Kafka cluster using the JavaScript client can
get up to 25,000 messages/second/partition and a Java Kafka client can get up to 200,000 messages/second/partition.
We will look to better understand the discrepancy between the JavaScript and Java clients. But also look to get
our document processing speeds closer to the Kafka upper bounds.   

### Kubernetes for service hosting

We will explore Kubernetes for service hosting and compare this against Docker Swarm, our current orchestration system.
Swarm has performed OK so far but also has been buggy when combined with Azure. We will look to see if Kubernetes
is more robust and also decide on which system to bet on for hosting our service. By the end of the sprint we will
have a 'production' system running on one of these engines that is available for wider demos/usage.

### Intelligent services

Our system currently has four intelligent services enabled. But we will look to expand it to more as we further
investigate our augmentation loop architecture. As part of this we will look to build a machine learning system
that can identify speakers in a document like Pride and Prejudice.

### Git for interactive document storage

We believe git can be used for the storage of our distributed objects and delta messages. Adopting git gives us a
proven system as well as robust ecosystem of tools. We also believe the git mechanics (branches, forks, pull requests)
open up innovative ways to create and manage interactive documents. Sprint 2 will investigate the feasability of git
as a storage mechanism. And should it be a good fit also begin implementing it within our system.