# Fluid Framework API overview

## Framework

Base classes and interfaces for Fluid Framework that implements basic default behavior of components and containers.

## Distributed Data Structure

Distributed data structures (DDS) that allow real time sharing of states across clients. There are two types of DDS:

* `Shared*` - distributed data structures which are based on eventual consistency; that is, these data structures
  eagerly update local state on changes and resolve conflicting changes on the client as operations are sequenced by
  the ordering service
* `Consensus*` - distributed data structures which are based on consensus; that is, operations are only applied
  *after* they are sequenced by the ordering service

## Runtime

Runtime interfaces and implementation.

## Loader

Loader for host pages to load a Fluid container, or just a component within the container.

## Driver

Client driver that implements the protocols that talks to a Fluid service backend (the ordering and storage services).
