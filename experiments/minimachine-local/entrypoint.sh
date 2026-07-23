#!/bin/sh
set -eu

# The public key is injected at `docker run` time via MM_PUBKEY so the image
# itself stays credential-free and reusable across machines.
if [ -n "${MM_PUBKEY:-}" ]; then
  echo "$MM_PUBKEY" > /home/agent/.ssh/authorized_keys
  chmod 600 /home/agent/.ssh/authorized_keys
  chown agent:agent /home/agent/.ssh/authorized_keys
fi

# Hand credentials to ssh sessions without exposing them in the process list.
# ponytail: ~/.ssh/environment is the only mechanism sshd offers for
# non-login, non-interactive `ssh host cmd` invocations.
: > /home/agent/.ssh/environment
chmod 600 /home/agent/.ssh/environment
[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] \
  && echo "CLAUDE_CODE_OAUTH_TOKEN=$CLAUDE_CODE_OAUTH_TOKEN" >> /home/agent/.ssh/environment
[ -n "${ANTHROPIC_API_KEY:-}" ] \
  && echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" >> /home/agent/.ssh/environment
chown agent:agent /home/agent/.ssh/environment

chown -R agent:agent /workspace 2>/dev/null || true

exec /usr/sbin/sshd -D -e
