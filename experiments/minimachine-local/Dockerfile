# Lightest base that can still run Claude Code (which needs Node).
# Alpine userland ~8MB; node:22-alpine lands ~140MB total.
FROM node:22-alpine

RUN apk add --no-cache openssh-server git ca-certificates tini python3 ttyd bash \
 && ssh-keygen -A \
 && adduser -D -s /bin/sh agent \
 # adduser -D leaves the shadow entry as `!` (locked). sshd refuses key auth
 # for locked accounts. `*` = no usable password, but not locked.
 && sed -i 's/^agent:!/agent:*/' /etc/shadow \
 && mkdir -p /home/agent/.ssh /workspace \
 && chown -R agent:agent /home/agent /workspace \
 && chmod 700 /home/agent/.ssh

RUN npm install -g @anthropic-ai/claude-code && npm cache clean --force

# Key-only SSH. PermitUserEnvironment lets the entrypoint hand the agent its
# API key via ~/.ssh/environment instead of putting it on a command line
# (where it would be visible in `ps`).
RUN printf '%s\n' \
      'PasswordAuthentication no' \
      'PermitRootLogin no' \
      'PermitUserEnvironment yes' \
      'AcceptEnv MM_*' \
      'PerSourcePenalties no' \
    >> /etc/ssh/sshd_config

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# 22 = ssh (agent execution path), 7681 = ttyd browser emulator (on demand)
EXPOSE 22 7681
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
