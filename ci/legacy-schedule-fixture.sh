#!/bin/bash
# Sourced by E2E tests. Never use these fixtures on a managed/developer machine.
if [ "${CI:-}" != "true" ]; then
  echo "FAIL: Legacy schedule fixtures are only permitted on disposable CI runners"
  return 1
fi

create_legacy_schedule() {
  case "$SCHEDULE_TYPE" in
    launchdaemon)
      # Do not run at load: assertions control when the retiring binary runs.
      cat <<EOF | sudo tee "$PLIST_FILE" > /dev/null
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.glean.mdm</string>
<key>ProgramArguments</key><array><string>$INSTALL_PATH</string><string>run</string><string>--skip-update</string></array>
<key>StartInterval</key><integer>86400</integer>
</dict></plist>
EOF
      sudo chmod 644 "$PLIST_FILE"
      sudo launchctl bootstrap system "$PLIST_FILE"
      ;;
    systemd)
      cat <<EOF | sudo tee "$SERVICE_FILE" > /dev/null
[Unit]
Description=Legacy Glean MDM E2E fixture
[Service]
Type=oneshot
ExecStart=$INSTALL_PATH run --skip-update
EOF
      cat <<EOF | sudo tee "$TIMER_FILE" > /dev/null
[Unit]
Description=Legacy Glean MDM E2E timer
[Timer]
OnActiveSec=1d
[Install]
WantedBy=timers.target
EOF
      sudo systemctl daemon-reload
      sudo systemctl enable --now glean-mdm.timer
      ;;
    schtasks)
      local windows_binary
      windows_binary=$(cygpath -w "$INSTALL_PATH")
      schtasks //Create //TN "$TASK_NAME" //TR "\"$windows_binary\" run --skip-update" \
        //SC ONCE //SD 12/31/2099 //ST 23:59 //RU SYSTEM //F
      ;;
  esac
}

assert_schedule_present() {
  case "$SCHEDULE_TYPE" in
    launchdaemon)
      test -f "$PLIST_FILE"
      sudo launchctl print system/com.glean.mdm > /dev/null
      ;;
    systemd)
      test -f "$SERVICE_FILE"
      test -f "$TIMER_FILE"
      sudo systemctl is-enabled glean-mdm.timer > /dev/null
      sudo systemctl is-active glean-mdm.timer > /dev/null
      ;;
    schtasks) schtasks //Query //TN "$TASK_NAME" > /dev/null ;;
  esac
}

schedule_is_absent() {
  case "$SCHEDULE_TYPE" in
    launchdaemon)
      [ ! -f "$PLIST_FILE" ] && ! sudo launchctl print system/com.glean.mdm > /dev/null 2>&1
      ;;
    systemd)
      [ ! -f "$SERVICE_FILE" ] && [ ! -f "$TIMER_FILE" ] &&
        ! sudo systemctl is-active glean-mdm.timer > /dev/null 2>&1 &&
        ! sudo systemctl is-enabled glean-mdm.timer > /dev/null 2>&1
      ;;
    schtasks) ! schtasks //Query //TN "$TASK_NAME" > /dev/null 2>&1 ;;
  esac
}

trigger_legacy_schedule() {
  case "$SCHEDULE_TYPE" in
    launchdaemon) sudo launchctl kickstart system/com.glean.mdm ;;
    systemd) sudo systemctl start --no-block glean-mdm.service ;;
    schtasks) schtasks //Run //TN "$TASK_NAME" ;;
  esac
}
