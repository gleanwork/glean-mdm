package hosts

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/pelletier/go-toml/v2"
	"gopkg.in/yaml.v3"

	"github.com/gleanwork/glean-mdm/internal/jsonutil"
	"github.com/gleanwork/glean-mdm/internal/logger"
)

// mergeConfig merges configToMerge into existing using the same one-level-deep
// semantics as the original configurators: object-valued top-level keys are
// merged (after URL dedup), scalar keys are overwritten.
func mergeConfig(existing, configToMerge map[string]any) map[string]any {
	if existing == nil {
		existing = map[string]any{}
	}
	for _, key := range sortedKeys(configToMerge) {
		value := configToMerge[key]
		if valueObj, ok := asObject(value); ok {
			existingSection, _ := asObject(existing[key])
			if existingSection == nil {
				existingSection = map[string]any{}
			}
			filtered := withoutDuplicateURLs(existingSection, valueObj)
			merged := make(map[string]any, len(existingSection)+len(filtered))
			for k, v := range existingSection {
				merged[k] = v
			}
			for k, v := range filtered {
				merged[k] = v
			}
			existing[key] = merged
		} else {
			existing[key] = value
		}
	}
	return existing
}

func atomicWrite(filePath string, data []byte) error {
	writePath := resolveWritePath(filePath)
	if err := os.MkdirAll(filepath.Dir(writePath), 0o755); err != nil {
		return err
	}
	tmp := writePath + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, writePath)
}

func configureJSONFile(configToMerge map[string]any, filePath string) error {
	existing := map[string]any{}
	if raw, err := os.ReadFile(filePath); err == nil {
		var parsed map[string]any
		if json.Unmarshal(raw, &parsed) == nil && parsed != nil {
			existing = parsed
		}
	}

	merged := mergeConfig(existing, configToMerge)
	data, err := jsonutil.MarshalIndent(merged)
	if err != nil {
		return err
	}
	if err := atomicWrite(filePath, data); err != nil {
		return err
	}
	logger.Info("Configured JSON: %s", filePath)
	return nil
}

func configureTOMLFile(configToMerge map[string]any, filePath string) error {
	existing := map[string]any{}
	if raw, err := os.ReadFile(filePath); err == nil {
		var parsed map[string]any
		if toml.Unmarshal(raw, &parsed) == nil && parsed != nil {
			existing = parsed
		}
	}

	merged := mergeConfig(existing, configToMerge)
	data, err := toml.Marshal(merged)
	if err != nil {
		return err
	}
	if err := atomicWrite(filePath, data); err != nil {
		return err
	}
	logger.Info("Configured TOML: %s", filePath)
	return nil
}

func configureYAMLFile(configToMerge map[string]any, filePath string) error {
	existing := map[string]any{}
	if raw, err := os.ReadFile(filePath); err == nil {
		var parsed map[string]any
		if yaml.Unmarshal(raw, &parsed) == nil && parsed != nil {
			existing = parsed
		}
	}

	merged := mergeConfig(existing, configToMerge)
	data, err := yaml.Marshal(merged)
	if err != nil {
		return err
	}
	if err := atomicWrite(filePath, data); err != nil {
		return err
	}
	logger.Info("Configured YAML: %s", filePath)
	return nil
}
