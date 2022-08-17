# Modular Schema

Work in progress system for modularizing the tree schema / type system.

Shared Tree requires a bunch of changeset related policy to actually run, which is provided by the ChangeFamily.
This library provides a modular way to author a ChangeFamily where it is composed out of a collection of FieldKinds.

A "field [kind](https://en.wikipedia.org/wiki/Kind_(type_theory)" is a generic field schema:
it defines everything about the field schema except for the actual child type set.

This means you can author a FieldKind for generic collection types, like array, sequence, and optional.
To do this FieldKinds must provide enough information such that the combined ChangeFamily can be generated,
so they have to include things like rebase policy and edit builders.
Additionally, any possible changes which involve interactions between different field kinds must be accounted for,
including schema upgrades and cross field kind moves.

These combined schema (made up of the field kinds) also need to support being used as view-schema,
including strongly typed schema related APIs, so some code and types for that are included as well.

Since this module provides functionality for implementing change-families, rebasers, schema languages etc,
and thus is only used for implementing [`feature-libraries`](../README.md), it can live in `feature-libraries`.
As this module matures and gets actually used, it likely should get moved out of `feature-libraries` and become canonical way to implement change-families.
