#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

root_source="$(findmnt -no SOURCE /)"
root_disk="/dev/$(lsblk -no PKNAME "$root_source")"
root_part="${root_source##*[!0-9]}"

if [[ -z "$root_part" || "$root_disk" == "/dev/" ]]; then
  echo "Could not determine root disk/partition from ${root_source}" >&2
  exit 1
fi

$SUDO apt-get update
$SUDO apt-get install -y cloud-guest-utils
$SUDO growpart "$root_disk" "$root_part"
$SUDO resize2fs "$root_source"
df -h /
