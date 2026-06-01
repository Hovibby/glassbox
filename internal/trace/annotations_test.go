// Copyright 2026 Glassbox Users
// SPDX-License-Identifier: Apache-2.0

package trace

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoadAnnotationFile_JSON(t *testing.T) {
	m := AnnotationMap{
		"CABC": {"author": "alice", "note": "entry"},
		"0x42": {"risk": "high"},
	}
	data, err := json.Marshal(m)
	require.NoError(t, err)

	f := filepath.Join(t.TempDir(), "ann.json")
	require.NoError(t, os.WriteFile(f, data, 0o600))

	got, err := LoadAnnotationFile(f)
	require.NoError(t, err)
	assert.Equal(t, "alice", got["CABC"]["author"])
	assert.Equal(t, "high", got["0x42"]["risk"])
}

func TestLoadAnnotationFile_YAML(t *testing.T) {
	yaml := "CABC:\n  author: bob\n  note: test\n"
	f := filepath.Join(t.TempDir(), "ann.yaml")
	require.NoError(t, os.WriteFile(f, []byte(yaml), 0o600))

	got, err := LoadAnnotationFile(f)
	require.NoError(t, err)
	assert.Equal(t, "bob", got["CABC"]["author"])
}

func TestLoadAnnotationFile_Missing(t *testing.T) {
	_, err := LoadAnnotationFile("/nonexistent/path.json")
	assert.Error(t, err)
}

func TestMergeAnnotations(t *testing.T) {
	root := NewTraceNode("root", "contract_call")
	root.ContractID = "CABC"
	child := NewTraceNode("child-1", "host_fn")
	child.ContractID = "CXYZ"
	root.AddChild(child)

	m := AnnotationMap{
		"CABC":    {"author": "alice"},
		"child-1": {"note": "matched by id"},
	}

	MergeAnnotations(root, m)

	assert.Equal(t, "alice", root.Annotations["author"])
	assert.Equal(t, "matched by id", child.Annotations["note"])
}

func TestMergeAnnotations_PreservesExisting(t *testing.T) {
	node := NewTraceNode("n1", "contract_call")
	node.ContractID = "CABC"
	node.Annotations = map[string]string{"existing": "value"}

	MergeAnnotations(node, AnnotationMap{"CABC": {"new": "tag"}})

	assert.Equal(t, "value", node.Annotations["existing"])
	assert.Equal(t, "tag", node.Annotations["new"])
}

func TestMergeAnnotations_NilRoot(t *testing.T) {
	// Should not panic
	MergeAnnotations(nil, AnnotationMap{"CABC": {"k": "v"}})
}

func TestMergeAnnotations_EmptyMap(t *testing.T) {
	node := NewTraceNode("n1", "contract_call")
	node.ContractID = "CABC"
	MergeAnnotations(node, AnnotationMap{})
	assert.Nil(t, node.Annotations)
}
