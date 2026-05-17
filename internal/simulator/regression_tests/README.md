# Regression Tests

This directory contains automatically generated regression tests from transaction traces.

## Purpose

These tests ensure that once a bug is fixed, it never returns. Each test captures:
- Transaction envelope (XDR)
- Result metadata (XDR)
- Ledger state at the time of execution

## Generating Tests

Use the `Glassbox generate-test` command to create new regression tests:

```bash
Glassbox generate-test <transaction-hash> --lang go
```

## Running Tests

```bash
go test ./internal/simulator/regression_tests/...
```
