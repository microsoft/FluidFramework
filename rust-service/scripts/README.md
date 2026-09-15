# Rust Service Scripts

These dependency-free shell and Node.js entry points validate or measure the benchmark harness without registering the benchmark crate in the assigned workspace. Benchmark scripts create an exact temporary copy, add the crate to that copy's workspace membership, use a separate Cargo target directory, and remove both on exit.

## Commands

- [`validate-benchmarks.sh`](validate-benchmarks.sh) runs format checking, benchmark unit tests, strict Clippy, and the bounded correctness smoke across all backends.
- [`measure-benchmarks.sh`](measure-benchmarks.sh) builds the harness in release mode and forwards one `measure` workload to it. Results are newline-delimited JSON on standard output.
- [`measure-wave3-benchmarks.sh`](measure-wave3-benchmarks.sh) runs the fixed 26-cell Wave 3 matrix with one warmup and five measured repetitions per cell. It writes measurements only to standard output.
- [`benchmark-common.sh`](benchmark-common.sh) contains shared copy preparation and assigned-manifest integrity checks. Source it from another script; do not run it as a benchmark.
- [`check-documentation.mjs`](check-documentation.mjs) discovers every Cargo
	package under `crates/` and `examples/`, requires READMEs for those packages and
	each direct integration-test harness, requires READMEs for the important
	architectural grouping folders, and verifies local Markdown links. Explicit
	path arguments restrict the check to those roots.

Run these commands from `rust-service/`:

```bash
bash scripts/validate-benchmarks.sh
bash scripts/measure-benchmarks.sh --backend memory --fixture small-incompressible --records 8 --writers 2 --snapshot-frequency 0 --warmups 0 --repetitions 1
node scripts/check-documentation.mjs
```

The measurement scripts set source commit, build profile, filesystem, and storage-device metadata. They do not retain results automatically. Redirect exploratory output outside [`../benchmarks/`](../benchmarks/); evidence belongs there only after its procedure, schema, and limitations are reviewed and documented.

The scripts require Bash, Node.js, Cargo, Git, and standard Linux utilities used directly in their source. They add no dependencies and must leave the assigned `Cargo.toml`, `Cargo.lock`, and retained benchmark evidence unchanged.