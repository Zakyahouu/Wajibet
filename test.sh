grep -n "catch (e) { console.error('join-game handler failed'" -A 4 server/socket/socketHandler.js
echo "=================="
grep -n "catch (e) { console.error('rejoin-game handler failed'" -A 4 server/socket/socketHandler.js
echo "=================="
grep -n "catch (e) { console.error('host-game handler failed'" -A 4 server/socket/socketHandler.js
echo "=================="
grep -n "host-error" client/src/pages/HostLobby.jsx
echo "=================="
grep -n -E "setTimeout|clearTimeout" client/src/pages/PlayerLobby.jsx
echo "=================="
grep -n -E "setTimeout|clearTimeout" client/src/pages/HostLobby.jsx
