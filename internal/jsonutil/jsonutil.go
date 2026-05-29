// Package jsonutil provides JSON marshaling that matches JavaScript's
// JSON.stringify(value, null, 2): two-space indent and no HTML escaping (so
// characters like &, <, > in URLs are preserved verbatim).
package jsonutil

import (
	"bytes"
	"encoding/json"
)

// MarshalIndent marshals v with a two-space indent and HTML escaping disabled.
func MarshalIndent(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	// Encoder.Encode appends a trailing newline, matching the original which
	// wrote `JSON.stringify(...) + "\n"`.
	return buf.Bytes(), nil
}
