// Copyright 2026 Glassbox Users
// SPDX-License-Identifier: Apache-2.0

package signer

import "os"

// NewFromEnv creates a Signer based on the GLASSBOX_SIGNER_TYPE environment
// variable. When the variable is absent or set to "software", an
// InMemorySigner is returned using the hex key from
// GLASSBOX_SOFTWARE_PRIVATE_KEY_HEX. When set to "pkcs11", a Pkcs11Signer
// is created from GLASSBOX_PKCS11_* environment variables.
func NewFromEnv() (Signer, error) {
	signerType := os.Getenv("GLASSBOX_SIGNER_TYPE")
	if signerType == "" {
		signerType = "software"
	}

	switch signerType {
	case "software":
		keyHex := os.Getenv("GLASSBOX_SOFTWARE_PRIVATE_KEY_HEX")
		if keyHex == "" {
			return nil, &Error{Op: "factory", Msg: "GLASSBOX_SOFTWARE_PRIVATE_KEY_HEX is required for software signer"}
		}
		return NewInMemorySigner(keyHex)

	case "pkcs11":
		cfg, err := Pkcs11ConfigFromEnv()
		if err != nil {
			return nil, err
		}
		return NewPkcs11Signer(*cfg)

	default:
		return nil, &Error{Op: "factory", Msg: "unsupported GLASSBOX_SIGNER_TYPE: " + signerType}
	}
}
