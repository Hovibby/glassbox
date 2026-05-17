// Copyright 2026 Glassbox Users
// SPDX-License-Identifier: Apache-2.0

package lsp

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"go.lsp.dev/protocol"
)

func TestServerDocumentLifecycleAndHover(t *testing.T) {
	srv := NewServer()
	uri := protocol.DocumentURI("file:///test.soroban")

	openParams := &protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:  uri,
			Text: "require_auth(account)\nstorage_put(key, value)",
		},
	}
	assert.NoError(t, srv.DidOpen(context.Background(), openParams))

	hoverParams := &protocol.HoverParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: uri},
			Position:     protocol.Position{Line: 0, Character: 2},
		},
	}
	hover, err := srv.Hover(context.Background(), hoverParams)
	assert.NoError(t, err)
	assert.NotNil(t, hover)
	assert.Contains(t, hover.Contents.Value, "require_auth")

	diagnostics, err := srv.DiagnosticsForDocument(context.Background(), uri)
	assert.NoError(t, err)
	assert.GreaterOrEqual(t, len(diagnostics), 1)
	assert.Contains(t, diagnostics[0].Message, "require_auth")

	changeParams := &protocol.DidChangeTextDocumentParams{
		TextDocument: protocol.VersionedTextDocumentIdentifier{
			TextDocumentIdentifier: protocol.TextDocumentIdentifier{URI: uri},
			Version:                2,
		},
		ContentChanges: []protocol.TextDocumentContentChangeEvent{
			{Text: "storage_get(key)\n"},
		},
	}
	assert.NoError(t, srv.DidChange(context.Background(), changeParams))

	diagnostics, err = srv.DiagnosticsForDocument(context.Background(), uri)
	assert.NoError(t, err)
	assert.GreaterOrEqual(t, len(diagnostics), 1)
	assert.Contains(t, diagnostics[0].Message, "storage_get")

	closeParams := &protocol.DidCloseTextDocumentParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: uri},
	}
	assert.NoError(t, srv.DidClose(context.Background(), closeParams))

	_, err = srv.DiagnosticsForDocument(context.Background(), uri)
	assert.Error(t, err)
}
