#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 16

trap 'kill 0' EXIT

(cd server && npm run dev 2>&1 | sed "s/^/\x1b[36m[server]\x1b[0m /") &
(cd app && NEXT_PUBLIC_WS_URL=ws://dev-dsk-palkimas-2b-06000f1d.us-west-2.amazon.com:3001 npm run dev 2>&1 | sed "s/^/\x1b[35m[app]\x1b[0m    /") &

wait
