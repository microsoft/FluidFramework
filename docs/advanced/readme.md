---
uid: advanced
---

# Advanced Topics

## Designing for concurrency

* Examples of problems that arise in concurrent world and how to properly deal with them (this is advanced topic, but it
  will help add trust into the system – i.e. we thought about these issues, and while we do not claim we have magical solution
  that solves all the needs, we believe with right approaches one can solve complex problems, and here are examples
  helping understand how to think though these problems).
  * Perhaps something "simple" like a collection of objects (comments) and references from shared string, possible
    approaches, need to GC non-rooted comments, etc.
