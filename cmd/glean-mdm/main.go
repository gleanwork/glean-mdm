// Command glean-mdm configures MCP servers across AI coding tools on managed
// devices. This is the Go port of the original TypeScript/bun CLI.
package main

import (
	"os"

	"github.com/gleanwork/glean-mdm/internal/cli"
	"github.com/gleanwork/glean-mdm/internal/logger"
	"github.com/gleanwork/glean-mdm/internal/version"
)

func main() {
	root := cli.NewRootCmd()

	// If no arguments provided, show help (no logger init, matching the original).
	if len(os.Args) == 1 {
		_ = root.Help()
		return
	}

	// Initialize the logger before executing any command, skipping --help/-h/
	// --version since those just print and exit.
	args := os.Args[1:]
	isHelpOrVersion := false
	for _, a := range args {
		if a == "--help" || a == "-h" || a == "--version" {
			isHelpOrVersion = true
			break
		}
	}

	if !isHelpOrVersion {
		logger.Init("")
		logger.Info("glean-mdm %s", version.BuildVersion)
	}

	if err := root.Execute(); err != nil {
		// Flag/usage errors are already printed by cobra; exit non-zero.
		os.Exit(1)
	}
}
