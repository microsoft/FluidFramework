# Decision 0005: Opaque Position Codec

Status: accepted
Date: 2026-09-12
Iteration: 0001
Owners: interactive user and GitHub Copilot
Supersedes: none
Superseded by: none

## Context

The Fluid and future network adapters need stream positions in reference and resume tokens. `Capability::PositionSerialization` advertised support but exposed no operation, so an independent adapter could not serialize a generic implementation's position.

## Decision Drivers

Positions must remain opaque, generation-scoped, and implementation-defined. Serialization should be optional and should not add ordering, arithmetic, or a universal wire representation to `StreamPosition`.

## Options and Evidence

Transport-owned tokens preserve opacity but prevent a transport wrapper from remaining generic. Deferring serialization blocks the approved network experiment. A focused optional trait lets implementations own encoding while callers depend only on opaque bytes.

## Decision

Add `PositionCodec: AppendStream` with `encode_position` and `decode_position` operations returning opaque `Bytes` and implementation-classified errors. Implementations advertise it with `Capability::PositionSerialization`. Malformed and foreign-generation tokens classify as invalid positions. Tokens carry no public ordering or arithmetic semantics.

## Consequences

Network and Fluid adapters can retain generic resume/reference tokens without interpreting positions. Implementations define token stability and must document whether tokens survive process restart. Supporting stores and transparent wrappers need codec conformance; implementations may omit the trait.

## Validation and Follow-Up

Memory round-trip, malformed-token, and cross-generation tests pass. Iteration `0002` extends codec conformance to persistent stores and the network wrapper, including reconnect and stale-generation behavior.
