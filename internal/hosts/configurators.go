package hosts

import (
	"encoding/json"
	"os"

	"github.com/pelletier/go-toml/v2"
	"gopkg.in/yaml.v3"

	"github.com/gleanwork/glean-mdm/internal/fsutil"
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

// codec captures the format-specific (un)marshaling and log label for a host
// config file. Everything else about configuring a file is format-agnostic.
type codec struct {
	name      string
	unmarshal func([]byte, any) error
	marshal   func(any) ([]byte, error)
}

var (
	jsonCodec = codec{name: "JSON", unmarshal: json.Unmarshal, marshal: jsonutil.MarshalIndent}
	tomlCodec = codec{name: "TOML", unmarshal: toml.Unmarshal, marshal: toml.Marshal}
	yamlCodec = codec{name: "YAML", unmarshal: yaml.Unmarshal, marshal: yaml.Marshal}
)

func configureFile(configToMerge map[string]any, filePath string, c codec) error {
	existing := map[string]any{}
	if raw, err := os.ReadFile(filePath); err == nil {
		var parsed map[string]any
		if c.unmarshal(raw, &parsed) == nil && parsed != nil {
			existing = parsed
		}
	}

	data, err := c.marshal(mergeConfig(existing, configToMerge))
	if err != nil {
		return err
	}
	if err := fsutil.AtomicWrite(filePath, data); err != nil {
		return err
	}
	logger.Info("Configured %s: %s", c.name, filePath)
	return nil
}

func configureJSONFile(configToMerge map[string]any, filePath string) error {
	return configureFile(configToMerge, filePath, jsonCodec)
}

func configureTOMLFile(configToMerge map[string]any, filePath string) error {
	return configureFile(configToMerge, filePath, tomlCodec)
}

func configureYAMLFile(configToMerge map[string]any, filePath string) error {
	return configureFile(configToMerge, filePath, yamlCodec)
}
