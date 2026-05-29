// Package cli wires the command-line interface, mirroring the command structure
// of the original index.ts (commander) using cobra.
package cli

import (
	"errors"
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/gleanwork/glean-mdm/internal/config"
	"github.com/gleanwork/glean-mdm/internal/configwriter"
	"github.com/gleanwork/glean-mdm/internal/extensions"
	"github.com/gleanwork/glean-mdm/internal/hosts"
	"github.com/gleanwork/glean-mdm/internal/logger"
	"github.com/gleanwork/glean-mdm/internal/scheduler"
	"github.com/gleanwork/glean-mdm/internal/uninstaller"
	"github.com/gleanwork/glean-mdm/internal/updater"
	"github.com/gleanwork/glean-mdm/internal/users"
	"github.com/gleanwork/glean-mdm/internal/version"
)

// Global options (mirror the commander global flags).
var (
	gDryRun        bool
	gUser          string
	gSkipUpdate    bool
	gMcpConfigPath string
	gMdmConfigPath string
)

func fatal(err error) {
	logger.Error("Fatal: %v", err)
	os.Exit(1)
}

// NewRootCmd builds the root command and all subcommands.
func NewRootCmd() *cobra.Command {
	root := &cobra.Command{
		Use:           "glean-mdm",
		Short:         "Configure MCP servers across AI coding tools on managed devices.",
		Version:       version.BuildVersion,
		SilenceUsage:  false,
		SilenceErrors: false,
	}
	// Match commander's `--version` output: the bare version string.
	root.SetVersionTemplate("{{.Version}}\n")

	root.PersistentFlags().BoolVar(&gDryRun, "dry-run", false, "Simulate without making changes")
	root.PersistentFlags().StringVar(&gUser, "user", "", "Configure a single user instead of all users")
	root.PersistentFlags().BoolVar(&gSkipUpdate, "skip-update", false, "Skip binary self-update check")
	root.PersistentFlags().StringVar(&gMcpConfigPath, "mcp-config", "", "Custom path to MCP config file")
	root.PersistentFlags().StringVar(&gMdmConfigPath, "mdm-config", "", "Custom path to MDM config file")

	root.AddCommand(newRunCmd())
	root.AddCommand(newInstallScheduleCmd())
	root.AddCommand(newUninstallScheduleCmd())
	root.AddCommand(newUninstallCmd())
	root.AddCommand(newConfigCmd())

	return root
}

func newRunCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "run",
		Short: "Run host configuration for all users",
		Run: func(cmd *cobra.Command, args []string) {
			if err := executeRun(); err != nil {
				fatal(err)
			}
		},
	}
}

func newInstallScheduleCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "install-schedule",
		Short: "Install system scheduled task (launchd/systemd/Task Scheduler)",
		Run: func(cmd *cobra.Command, args []string) {
			scheduler.Install()
		},
	}
}

func newUninstallScheduleCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "uninstall-schedule",
		Short: "Remove system scheduled task",
		Run: func(cmd *cobra.Command, args []string) {
			scheduler.Uninstall()
		},
	}
}

func newUninstallCmd() *cobra.Command {
	var keepConfig bool
	cmd := &cobra.Command{
		Use:   "uninstall",
		Short: "Full uninstall (removes schedule, config, logs, and binary)",
		Run: func(cmd *cobra.Command, args []string) {
			uninstaller.FullUninstall(uninstaller.Options{KeepConfig: keepConfig})
		},
	}
	cmd.Flags().BoolVar(&keepConfig, "keep-config", false, "Preserve config files during uninstall")
	return cmd
}

func newConfigCmd() *cobra.Command {
	var (
		serverName      string
		serverURL       string
		autoUpdate      bool
		noAutoUpdate    bool
		versionURL      string
		binaryURLPrefix string
		pinnedVersion   string
		outputDir       string
	)
	cmd := &cobra.Command{
		Use:   "config",
		Short: "Generate mcp-config.json and mdm-config.json files",
		Run: func(cmd *cobra.Command, args []string) {
			// autoUpdate must be explicitly set via --auto-update or --no-auto-update.
			autoSet := cmd.Flags().Changed("auto-update")
			noAutoSet := cmd.Flags().Changed("no-auto-update")
			if !autoSet && !noAutoSet {
				fmt.Fprintln(os.Stderr, "Error: --auto-update or --no-auto-update is required for config subcommand")
				os.Exit(1)
			}
			resolvedAutoUpdate := autoSet
			if noAutoSet {
				resolvedAutoUpdate = false
			}

			err := configwriter.Write(configwriter.Options{
				ServerName:      serverName,
				ServerURL:       serverURL,
				AutoUpdate:      resolvedAutoUpdate,
				VersionURL:      versionURL,
				BinaryURLPrefix: binaryURLPrefix,
				PinnedVersion:   pinnedVersion,
				OutputDir:       outputDir,
			})
			if err != nil {
				var ve *config.ValidationError
				if errors.As(err, &ve) {
					fmt.Fprintf(os.Stderr, "%s\n", ve.Error())
					os.Exit(1)
				}
				fatal(err)
			}
		},
	}
	cmd.Flags().StringVar(&serverName, "server-name", "", "Identifier for the MCP server")
	cmd.Flags().StringVar(&serverURL, "server-url", "", "MCP server endpoint URL")
	cmd.Flags().BoolVar(&autoUpdate, "auto-update", false, "Enable automatic binary updates")
	cmd.Flags().BoolVar(&noAutoUpdate, "no-auto-update", false, "Disable automatic binary updates")
	cmd.Flags().StringVar(&versionURL, "version-url", "", "URL to fetch latest version info")
	cmd.Flags().StringVar(&binaryURLPrefix, "binary-url-prefix", "", "Base URL for downloading binaries")
	cmd.Flags().StringVar(&pinnedVersion, "pinned-version", "", "Pin to a specific version")
	cmd.Flags().StringVar(&outputDir, "output-dir", "", "Directory to write config files to")
	_ = cmd.MarkFlagRequired("server-name")
	_ = cmd.MarkFlagRequired("server-url")
	_ = cmd.MarkFlagRequired("binary-url-prefix")
	return cmd
}

func executeRun() error {
	mcpConfig, err := config.ReadMcpConfig(gMcpConfigPath)
	if err != nil {
		return err
	}
	mdmConfig, err := config.ReadMdmConfig(gMdmConfigPath)
	if err != nil {
		return err
	}

	for _, server := range mcpConfig.Servers {
		logger.Info("Server: %s (%s)", server.ServerName, config.GetServerURL(server))
	}

	if !gSkipUpdate && mdmConfig.AutoUpdate {
		updater.CheckForUpdate(mdmConfig.VersionURL, mdmConfig.BinaryURLPrefix, mdmConfig.PinnedVersion)
	} else if !mdmConfig.AutoUpdate {
		logger.Info("Auto-update disabled by configuration")
	}

	var userList []users.UserInfo
	if gUser != "" {
		user := users.Lookup(gUser)
		if user == nil {
			logger.Error("User not found: %s", gUser)
			os.Exit(1)
		}
		userList = []users.UserInfo{*user}
	} else {
		userList = users.Enumerate()
	}

	logger.Info("Found %d user(s)", len(userList))

	totalSuccess := 0
	totalFailure := 0

	for _, user := range userList {
		logger.Info("Configuring hosts for %s (%s)", user.Username, user.HomeDir)
		results := hosts.Configure(hosts.Options{
			Servers:     mcpConfig.Servers,
			DryRun:      gDryRun,
			GID:         user.GID,
			UID:         user.UID,
			UserHomeDir: user.HomeDir,
			Username:    user.Username,
		})
		for _, r := range results {
			if r.Success {
				totalSuccess++
			} else {
				totalFailure++
			}
		}
	}

	logger.Info("Hosts: %d configured, %d failed", totalSuccess, totalFailure)

	extensionSuccess := 0
	extensionFailure := 0

	activeUsers, ok := users.ActiveSessionUsers()
	if !ok {
		logger.Warn("Could not determine active sessions; installing extensions for all users")
	}

	for _, user := range userList {
		if ok && !activeUsers[user.Username] {
			logger.Info("Skipping extensions for %s (no active session)", user.Username)
			continue
		}

		logger.Info("Installing extensions for %s (%s)", user.Username, user.HomeDir)
		extResults := extensions.Install(extensions.Options{
			DryRun:      gDryRun,
			GID:         user.GID,
			UID:         user.UID,
			UserHomeDir: user.HomeDir,
			Username:    user.Username,
		})
		for _, r := range extResults {
			if r.Skipped {
				continue
			}
			if r.Success {
				extensionSuccess++
			} else {
				extensionFailure++
			}
		}
	}

	logger.Info("Extensions: %d installed, %d failed", extensionSuccess, extensionFailure)

	if totalFailure > 0 || extensionFailure > 0 {
		os.Exit(1)
	}
	return nil
}
