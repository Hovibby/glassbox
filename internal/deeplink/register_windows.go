// Copyright 2026 Glassbox Users
// SPDX-License-Identifier: Apache-2.0

package deeplink

import (
	"os/exec"
	"strings"
)

// checkRegistration queries the Windows registry for the glassbox:// URL handler.
func checkRegistration(selfPath string) Result {
	res := Result{
		FixSteps: genericFixSteps(),
	}

	// Query HKEY_CLASSES_ROOT\Glassbox to see if the key exists.
	out, err := exec.Command(
		"reg", "query", `HKEY_CLASSES_ROOT\Glassbox`, "/ve",
	).Output()

	if err != nil {
		return res
	}

	value := strings.ToLower(string(out))
	if strings.Contains(value, "url:Glassbox") || strings.Contains(value, "url protocol") {
		res.Registered = true
		res.Handler = strings.TrimSpace(string(out))
		res.FixSteps = nil
	}

	return res
}
