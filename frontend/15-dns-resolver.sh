#!/bin/sh
# Writes an nginx "resolver" line from the container's DNS server, so nginx re-resolves the
# API host at request time (the API's private IP changes on every redeploy on Railway).
# Works for Railway (IPv6 DNS, e.g. fd12::10) and docker-compose (127.0.0.11).
set -e
ns=$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf)
[ -z "$ns" ] && ns=127.0.0.11
case "$ns" in *:*) ns="[$ns]" ;; esac
echo "resolver $ns valid=10s;" > /etc/nginx/conf.d/00-resolver.conf
echo "15-dns-resolver.sh: using DNS $ns"
