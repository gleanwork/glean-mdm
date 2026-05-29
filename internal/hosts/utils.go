package hosts

import (
	"sort"

	"github.com/gleanwork/glean-mdm/internal/logger"
	"github.com/gleanwork/glean-mdm/internal/registry"
)

// urlPropertyNames is the set of URL property names across all clients, used to
// detect duplicate server entries (mirrors getAllUrlPropertyNames).
var urlPropertyNames = registry.URLPropertyNames()

// asObject returns the value as a map if it is a plain object (JSON object /
// YAML mapping / TOML table), matching isPlainObject.
func asObject(val any) (map[string]any, bool) {
	m, ok := val.(map[string]any)
	return m, ok
}

func getEntryURL(entry any) string {
	m, ok := asObject(entry)
	if !ok {
		return ""
	}
	for _, prop := range urlPropertyNames {
		if v, ok := m[prop].(string); ok {
			return v
		}
	}
	return ""
}

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// withoutDuplicateURLs drops incoming server entries whose URL already exists in
// the target file (under a different key) or earlier in the incoming batch.
func withoutDuplicateURLs(existingSection, incomingSection map[string]any) map[string]any {
	existingURLs := make(map[string]string)
	for _, name := range sortedKeys(existingSection) {
		if url := getEntryURL(existingSection[name]); url != "" {
			existingURLs[url] = name
		}
	}

	seenURLs := make(map[string]string)
	filtered := make(map[string]any)
	for _, name := range sortedKeys(incomingSection) {
		entry := incomingSection[name]
		url := getEntryURL(entry)
		if url != "" {
			if existingName, ok := existingURLs[url]; ok && name != existingName {
				logger.Info("Skipped server %q — URL already configured under %q", name, existingName)
				continue
			}
			if seenName, ok := seenURLs[url]; ok {
				logger.Info("Skipped server %q — URL already in incoming batch under %q", name, seenName)
				continue
			}
			seenURLs[url] = name
		}
		filtered[name] = entry
	}
	return filtered
}
