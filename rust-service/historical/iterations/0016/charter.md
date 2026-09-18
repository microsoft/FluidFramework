# Iteration 0016 Charter

Status: active
Source commit: `69f0e22ed3a7e659bf9ed3af77ce08d22e96a156`
Coordinator: GitHub Copilot

## Questions and Hypotheses

- **Contract traceability:** An inherited `already adequate` disposition may describe behavior found in implementation or tests without precise contract text promising it to consumers. Quoting or linking the actual contract for every adequate row should expose any material implicit guarantee.
- **Diagnostic locality:** Shared conformance may fail for the correct decision yet leave diagnosis remote from the owner. Asking whether a practical owner-local assertion names that decision should expose remaining localized gaps.
- **Convergence:** After two risk-driven runs, most inherited dispositions should need no change. A run that records exact evidence and finds no material new deficiency is positive convergence evidence.

## Active Workstreams

One write-capable `contract-locality` workstream reviews all inherited adequate rows from iteration `0015`. It may write Rust crate roots and its report, implements at most two unrelated clusters, and stops when every row has precise contract text plus local diagnostic evidence or a justified broader boundary.

## Deferred Scope

The six inherited semantic, fault, persistence, browser, and handshake deferrals remain outside scope unless new deterministic evidence makes them practical. Generated artifacts, non-Rust packages, dependencies, manifests, lockfiles, formats, public semantic changes, and broad new audits are deferred.

## Shared Validation

The workstream runs focused checks after edits, then workspace format, strict Clippy, warning-denied rustdoc, all-target/all-feature workspace tests, documentation checks, diff, lockfile, and ownership guards. Integration runs `./test.sh`, repository policy, and `pnpm build:fast` when registered inputs change. Phase 3 validates complete records and the quality inventory.

## Contract and Test Evidence

Every inherited adequate disposition must quote or link precise contract text, name the exact owning decision, and identify a practical owner-local test that fails if it regresses. Shared conformance proves shared laws but does not automatically provide local diagnosis. Broader tests remain distinct boundary evidence. Exceptions must explain why local evidence is impractical.

## Risks and Escalation

- Do not invent promises from implementation behavior or duplicate conformance mechanically.
- Stop at two clusters or when a gap requires shared semantics, formats, dependencies, manifests, browser or fault fixtures, or another policy decision.
- Move directly to Phase 3 if all inherited adequate rows satisfy both refined requirements without code changes.
