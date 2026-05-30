// Copyright 2026 Glassbox Users
// SPDX-License-Identifier: Apache-2.0

package trace

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestExportExecutionTrace_HTMLAndMarkdown(t *testing.T) {
	trace := NewExecutionTrace("test-tx-hash", 10)
	trace.StartTime = time.Date(2026, time.January, 2, 15, 4, 5, 0, time.UTC)
	trace.EndTime = trace.StartTime.Add(5 * time.Minute)

	trace.AddState(ExecutionState{
		Operation:  "contract_call",
		EventType:  "contract_call",
		ContractID: "C123",
		Function:   "transfer",
		Arguments:  []interface{}{"100", "XLM"},
		ReturnValue: "ok",
	})
	trace.AddState(ExecutionState{
		Operation: "host_function",
		Error:     "insufficient balance",
	})

	tmpDir := t.TempDir()
	htmlPath := filepath.Join(tmpDir, "trace-export.html")
	if err := ExportExecutionTrace(trace, "html", htmlPath); err != nil {
		t.Fatalf("ExportExecutionTrace(html) failed: %v", err)
	}
	data, err := os.ReadFile(htmlPath)
	if err != nil {
		t.Fatalf("failed to read exported html file: %v", err)
	}
	content := string(data)
	if !strings.Contains(content, "Glassbox Trace Export") {
		t.Fatalf("exported html missing expected header")
	}
	if !strings.Contains(content, "contract_call") {
		t.Fatalf("exported html missing step operation")
	}

	mdPath := filepath.Join(tmpDir, "trace-export.md")
	if err := ExportExecutionTrace(trace, "markdown", mdPath); err != nil {
		t.Fatalf("ExportExecutionTrace(markdown) failed: %v", err)
	}
	data, err = os.ReadFile(mdPath)
	if err != nil {
		t.Fatalf("failed to read exported markdown file: %v", err)
	}
	content = string(data)
	if !strings.Contains(content, "# Glassbox Trace Export") {
		t.Fatalf("exported markdown missing expected header")
	}
	if !strings.Contains(content, "transfer") {
		t.Fatalf("exported markdown missing expected function name")
	}
}
