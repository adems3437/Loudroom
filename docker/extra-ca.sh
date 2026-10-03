# Sourced by RUN steps that reach the network (docker/*.Dockerfile). When the optional
# `extra_ca` build secret holds a TLS-intercepting proxy's CA (docs/DEPLOY.md), Node, pnpm and
# Rust-based tools (Turbopack's font download) trust it next to the public roots; otherwise
# nothing changes.
if [ -s /run/secrets/extra_ca ]; then
  cat /etc/ssl/certs/ca-certificates.crt /run/secrets/extra_ca > /tmp/loudroom-ca.pem
  export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca
  export npm_config_cafile=/tmp/loudroom-ca.pem
  export SSL_CERT_FILE=/tmp/loudroom-ca.pem
fi
