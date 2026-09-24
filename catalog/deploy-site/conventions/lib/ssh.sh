#!/usr/bin/env bash
# ssh.sh — Hardened SSH helpers (shared library)
#
# Every remote operation in the agency toolkit goes through these helpers so that
# the hardening rules in conventions/safety.md are applied uniformly:
#
#   - StrictHostKeyChecking=yes   (no silent host key changes)
#   - BatchMode=yes               (never prompt for a password; key auth only)
#   - ForwardAgent=no             (no agent forwarding)
#   - ConnectTimeout / ServerAliveInterval
#
# The toolkit never uses ssh-keyscan.

SSH_OPTS=(
    -o StrictHostKeyChecking=yes
    -o BatchMode=yes
    -o ForwardAgent=no
    -o ConnectTimeout=10
    -o ServerAliveInterval=30
    -o ServerAliveCountMax=3
)

# ssh_target <host> [user] -> "user@host"
ssh_target() {
    local host="$1"
    local user="${2:-}"
    if [[ -n "${user}" ]]; then
        printf '%s@%s\n' "${user}" "${host}"
    else
        printf '%s\n' "${host}"
    fi
}

# ssh_run <host> <command...>
ssh_run() {
    local host="$1"; shift
    ssh "${SSH_OPTS[@]}" "${host}" "$@"
}

# ssh_user_run <user> <host> <command...>
ssh_user_run() {
    local user="$1"; shift
    local host="$1"; shift
    ssh "${SSH_OPTS[@]}" "$(ssh_target "${host}" "${user}")" "$@"
}

# ssh_script <host> <<'EOF' ... EOF   (pipe a local script into the remote shell)
ssh_script() {
    local host="$1"
    ssh "${SSH_OPTS[@]}" "${host}" 'bash -s'
}

# scp_put <local> <user> <host> <remote>
scp_put() {
    local local_path="$1" user="$2" host="$3" remote="$4"
    scp "${SSH_OPTS[@]}" "${local_path}" "$(ssh_target "${host}" "${user}"):${remote}"
}

# Resolve the real hostname behind an SSH alias without connecting.
ssh_resolve_hostname() {
    local alias="$1"
    ssh -G "${alias}" 2>/dev/null | awk '/^hostname / { print $2; exit }'
}

# True when the alias exists in the SSH config.
ssh_alias_known() {
    local alias="$1"
    local resolved
    resolved="$(ssh_resolve_hostname "${alias}")"
    [[ -n "${resolved}" && "${resolved}" != "${alias}" ]] || ssh -G "${alias}" >/dev/null 2>&1
}
