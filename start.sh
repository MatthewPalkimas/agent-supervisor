#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 16

trap 'kill 0' EXIT

(cd server && npm run dev 2>&1 | awk '{
  if ($0 ~ /\[ACP\]/) print "\033[36m[server]\033[0m \033[35m[ACP]\033[0m " substr($0, index($0,"[ACP]")+6)
  else if ($0 ~ /\[Orchestrator\]/) print "\033[36m[server]\033[0m \033[33m[Orchestrator]\033[0m " substr($0, index($0,"[Orchestrator]")+15)
  else if ($0 ~ /\[SupervisorPoller\]/) print "\033[36m[server]\033[0m \033[97m[SupervisorPoller]\033[0m " substr($0, index($0,"[SupervisorPoller]")+19)
  else if ($0 ~ /\[SessionPoller\]/) print "\033[36m[server]\033[0m \033[90m[SessionPoller]\033[0m " substr($0, index($0,"[SessionPoller]")+16)
  else if ($0 ~ /\[Server\]/) print "\033[36m[server]\033[0m \033[32m[Server]\033[0m " substr($0, index($0,"[Server]")+9)
  else if ($0 ~ /\[WS\]/) print "\033[36m[server]\033[0m \033[34m[WS]\033[0m " substr($0, index($0,"[WS]")+5)
  else print "\033[36m[server]\033[0m " $0
}') &
(cd app && NEXT_PUBLIC_WS_URL=ws://dev-dsk-palkimas-2b-06000f1d.us-west-2.amazon.com:3001 NEXT_PUBLIC_SSH_HOST=dev-dsk-palkimas-2b-06000f1d.us-west-2.amazon.com npm run dev 2>&1 | sed "s/^/\x1b[35m[app]\x1b[0m    /") &

wait
