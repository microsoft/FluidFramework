---
uid: architecture
---

# Architecture

## Server

Responsibilities of the server:

* Assign sequence numbers to ops from clients
* Broadcast ops to all connected clients
* Data persistence

We provide a reference implementation of a Fluid server called [Routerlicious](./server/README.md).

## Client

* Uses Runtime SDK to interact with DDS instances

## Read more

The following links are helpful to understanding the architecture and technology behind Fluid:

### Git

* <http://stefan.saasen.me/articles/git-clone-in-haskell-from-the-bottom-up/>
* <https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain>

### Kafka and Total Order Broadcast

* <https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying>
* <https://engineering.linkedin.com/kafka/benchmarking-apache-kafka-2-million-writes-second-three-cheap-machines>
* <http://bookkeeper.apache.org/distributedlog/technical-review/2016/09/19/kafka-vs-distributedlog.html>

### Block chain

* <https://arxiv.org/abs/1801.10228>
* <https://www.hyperledger.org/wp-content/uploads/2017/08/Hyperledger_Arch_WG_Paper_1_Consensus.pdf>
* <https://medium.com/blockchainspace/trust-your-competitor-how-you-can-do-with-hyperledger-fabric-5939bacffe76>
