// Copyright 2026 Glassbox Users
// SPDX-License-Identifier: Apache-2.0

package trace

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// AnnotationMap maps a contract ID or instruction offset key to a set of
// user-defined metadata tags. Keys are either a contract ID string or a
// hex instruction offset prefixed with "0x".
//
// Example JSON:
//
//	{
//	  "CABC123...": {"author": "alice", "note": "entry point"},
//	  "0x0042":     {"risk": "high"}
//	}
type AnnotationMap map[string]map[string]string

// LoadAnnotationFile reads an annotation map from a JSON or YAML file.
// The file format is inferred from the extension (.json, .yaml, .yml).
func LoadAnnotationFile(path string) (AnnotationMap, error) {
	data, err := os.ReadFile(path) //nolint:gosec // path is user-supplied intentionally
	if err != nil {
		return nil, fmt.Errorf("annotation: read %s: %w", path, err)
	}

	var m AnnotationMap
	switch strings.ToLower(filepath.Ext(path)) {
	case ".yaml", ".yml":
		if err := yaml.Unmarshal(data, &m); err != nil {
			return nil, fmt.Errorf("annotation: parse YAML %s: %w", path, err)
		}
	default:
		if err := json.Unmarshal(data, &m); err != nil {
			return nil, fmt.Errorf("annotation: parse JSON %s: %w", path, err)
		}
	}
	return m, nil
}

// MergeAnnotations walks the trace tree and attaches annotations from m to
// each node whose ContractID or instruction-offset key matches an entry in m.
// Existing annotations on a node are preserved; conflicting keys are overwritten
// by the incoming map.
func MergeAnnotations(root *TraceNode, m AnnotationMap) {
	if root == nil || len(m) == 0 {
		return
	}
	for _, node := range root.FlattenAll() {
		mergeNodeAnnotations(node, m)
	}
}

func mergeNodeAnnotations(node *TraceNode, m AnnotationMap) {
	// Match by contract ID
	if node.ContractID != "" {
		if tags, ok := m[node.ContractID]; ok {
			node.Annotations = mergeTags(node.Annotations, tags)
		}
	}
	// Match by instruction offset key (e.g. "0x0042") via node ID
	if tags, ok := m[node.ID]; ok {
		node.Annotations = mergeTags(node.Annotations, tags)
	}
}

func mergeTags(existing, incoming map[string]string) map[string]string {
	if existing == nil {
		existing = make(map[string]string, len(incoming))
	}
	for k, v := range incoming {
		existing[k] = v
	}
	return existing
}
