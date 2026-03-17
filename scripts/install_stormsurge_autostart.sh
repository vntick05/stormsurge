#!/usr/bin/env bash
set -euo pipefail

AUTOSTART_DIR="${HOME}/.config/autostart"
AUTOSTART_FILE="${AUTOSTART_DIR}/StormSurge-Autostart.desktop"
START_SCRIPT="/home/admin/stormsurge/scripts/start_full_local_stack.sh"

mkdir -p "${AUTOSTART_DIR}"

cat > "${AUTOSTART_FILE}" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=StormSurge Autostart
Comment=Auto-start StormSurge and TRT stack on login
Exec=${START_SCRIPT}
Icon=/usr/share/icons/Yaru/256x256@2x/apps/gnome-terminal.png
Terminal=false
Hidden=false
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=20
EOF

chmod 644 "${AUTOSTART_FILE}"
printf 'Installed %s\n' "${AUTOSTART_FILE}"
