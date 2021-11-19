---
title: "Eventual consistency and perceived performance"
date: "2021-05-01"
---

This post will deep dive into eventual consistency and how DDSes like SharedSequence ensure it while enabling local changes to be merged optimistically. A walk-through or animation of the merge-tree algorithm might be helpful as an illustration.
