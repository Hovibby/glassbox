// Copyright 2026 Glassbox Users
// SPDX-License-Identifier: Apache-2.0

package visualizer

import (
	"testing"
)

func TestDiffLedgerEntries(t *testing.T) {
	before := map[string]string{
		"key1": "value1",
		"key2": "value2",
		"key3": "value3",
	}
	after := map[string]string{
		"key1": "value1",     // unchanged
		"key2": "value2_new", // modified
		"key4": "value4",     // added
	}

	entries := DiffLedgerEntries(before, after)

	// Verify counts
	added, removed, modified, unchanged := 0, 0, 0, 0
	for _, e := range entries {
		switch e.ChangeKind {
		case ledgerAdded:
			added++
		case ledgerRemoved:
			removed++
		case ledgerModified:
			modified++
		case ledgerUnchanged:
			unchanged++
		}
	}

	if added != 1 {
		t.Errorf("expected 1 added entry, got %d", added)
	}
	if removed != 1 {
		t.Errorf("expected 1 removed entry, got %d", removed)
	}
	if modified != 1 {
		t.Errorf("expected 1 modified entry, got %d", modified)
	}
	if unchanged != 1 {
		t.Errorf("expected 1 unchanged entry, got %d", unchanged)
	}
}

func TestTruncateLedgerValue(t *testing.T) {
	tests := []struct {
		name     string
		val      string
		maxLen   int
		expected string
	}{
		{"empty", "", 10, "<none>"},
		{"short", "abc", 10, "abc"},
		{"exact", "1234567890", 10, "1234567890"},
		{"long", "12345678901", 10, "123456789…"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := truncateLedgerValue(tt.val, tt.maxLen)
			if result != tt.expected {
				t.Errorf("truncateLedgerValue(%q, %d) = %q, want %q",
					tt.val, tt.maxLen, result, tt.expected)
			}
		})
	}
}

func TestShortenLedgerKey(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		expected string
	}{
		{"short", "abc", "abc"},
		{"exact", "1234567890123456789012345678901234567890", "1234567890123456789012345678901234567890"},
		{"long", "12345678901234567890123456789012345678901234567890", "12345678…34567890"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := shortenLedgerKey(tt.key)
			if result != tt.expected {
				t.Errorf("shortenLedgerKey(%q) = %q, want %q",
					tt.key, result, tt.expected)
			}
		})
	}
}

func TestPadRight(t *testing.T) {
	tests := []struct {
		name     string
		s        string
		w        int
		expected string
	}{
		{"empty", "", 5, "     "},
		{"short", "ab", 5, "ab   "},
		{"exact", "12345", 5, "12345"},
		{"long", "123456", 5, "123456"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := padRight(tt.s, tt.w)
			if result != tt.expected {
				t.Errorf("padRight(%q, %d) = %q, want %q",
					tt.s, tt.w, result, tt.expected)
			}
		})
	}
}
