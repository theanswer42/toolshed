#!/usr/bin/env bash
# Render allowlist.txt into a Squid dstdomain file.
# Usage: render-squid.sh <allowlist.txt> <out.dstdomain>
# Fails on any line that is not a plain lowercase domain, so a typo can never
# widen the list (for example a stray "." or "*").
set -euo pipefail

in=$1
out=$2
domain_re='^\.?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'

n=0
lineno=0
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
while IFS= read -r line || [[ -n $line ]]; do
	lineno=$((lineno + 1))
	line=${line%%#*}
	# Trim the ends only; whitespace inside an entry makes it invalid.
	line=${line#"${line%%[![:space:]]*}"}
	line=${line%"${line##*[![:space:]]}"}
	[[ -z $line ]] && continue
	if [[ ! $line =~ $domain_re ]]; then
		echo "render-squid: $in:$lineno: not a domain: '$line'" >&2
		exit 1
	fi
	printf '%s\n' "$line" >>"$tmp"
	n=$((n + 1))
done <"$in"

if ((n == 0)); then
	echo "render-squid: $in has no domains" >&2
	exit 1
fi
sort -u "$tmp" >"$out"
echo "render-squid: $n domains" >&2
