const $ = id => document.getElementById(id);
const state = { nearby: [], history: [], saved: [], macros: JSON.parse(localStorage.getItem("tavernkeeper-macros") || "[]") };
const settings = [
	["Drop all on death", "DropAllOnDeath", true], ["Seconds before respawn", "RespawnTimeSeconds"],
	["Time speed multiplier", "TimeSpeedMultiplier"], ["Experience multiplier", "XPX"],
	["Global damage multiplier", "DamageX"], ["PVP damage enabled", "IsPVPEnabled", true],
	["PVP damage multiplier", "PVPMultiplier"], ["PVP cripple multiplier", "PVPCrippleMultiplier"],
	["Hunger deals damage", "HungerDealsDamage", true], ["Hunger tick rate", "HungerTick"],
	["Community storage multiplier", "CommunityStorageMultiplier"]
];
const teleports = [["Spawn", "RespawnPoint"], ["Outside Cave", "OutsideCave"], ["Outside Forest", "OutsideForest"], ["Outside Tower", "OutsideTower"], ["Outside Lake", "OutsideLake"], ["Mountain Pass", "MountainPass"], ["Glades", "Glades"], ["Rock Arena", "OutsideRockArena"], ["Battlefield", "BattleField"], ["Tower CP1", "TowerCP1"], ["Tower CP2", "TowerCP2"], ["Tower End", "TowerEnd"], ["Woodcutting Shrine", "WoodcuttingShrine"], ["Archery Shrine", "ArcheryShrine"], ["Melee Shrine", "MeleeShrine"]];
const stats = [["health", "Health", 0, 2], ["maxhealth", "Max Health", 0, 31], ["speed", "Speed", 0, 15], ["damage", "Damage", 0, 15], ["poison", "Poison", 0, 31], ["hunger", "Hunger", 0, 2], ["damageprotection", "Damage Protection", .1, 10], ["crippledamageprotection", "Cripple Dmg Protection", .1, 10], ["luminosity", "Luminosity", 0, 15], ["cripplehealth", "Cripple Health", 0, 1], ["xpboost", "XP Boost", .1, 10], ["nightmare", "Nightmare", 0, 1], ["fullness", "Fullness", 0, 6], ["left-hand-stamina", "L. Stamina", 0, .2], ["right-hand-stamina", "R. Stamina", 0, .2], ["maxHandStamina", "Max Hand Stamina", .2, .4], ["aggro", "Aggro", 1, 10], ["Frost", "Frost", 0, 1], ["playerweight", "Player Weight", 0, 99999], ["recentdamage", "Recent Damage", 0, 1]];

async function api(url, options = {}) {
	const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
	const data = await response.json();
	if (!response.ok) throw new Error(data.error || "Request failed");
	return data;
}
function say(message) { $("toast").textContent = message; }
function target() { const value = $("player").value.trim(); if (!value) { say("Choose a target player first."); return null; } return value; }
function quote(value) { return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }
async function command(value) {
	try { const result = await api("/api/command", { method: "POST", body: JSON.stringify({ command: value }) }); say(result.resultString || JSON.stringify(result.result ?? result)); await status(); return result; }
	catch (error) { say(error.message); return null; }
}
function bindCommand(id, build) { $(id).addEventListener("click", () => { const value = build(); if (value) command(value); }); }
async function status() {
	try {
		const data = await api("/api/status");
		$("connection").textContent = data.connected ? "Connected" : "Disconnected";
		$("connection").classList.toggle("connected", data.connected);
		$("consoleOutput").textContent = data.lines.join("\n") || "No console output yet.";
	} catch (error) { say(error.message); }
}
async function refreshPlayers() {
	try {
		const data = await api("/api/players");
		const players = (data.players || []).map(player => player.username || player.Username).filter(Boolean);
		$("player").innerHTML = players.length ? players.map(name => `<option>${escapeHtml(name)}</option>`).join("") : "<option value=''>No players online</option>";
		say(`${players.length} player(s) loaded`);
	} catch (error) { say(error.message); }
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
async function prefabPicker(input) {
	const result = await command("spawn list");
	const raw = result && result.result;
	const prefabs = Array.isArray(raw) ? raw.map(item => [item.Hash ?? item.hash, item.Name ?? item.name]).filter(item => item[0] !== undefined) : [];
	if (!prefabs.length) { say("The server did not return a prefab list."); return; }
	const search = prompt(`Search ${prefabs.length} prefabs (name or hash):`, "");
	if (search === null) return;
	const match = prefabs.find(([hash, name]) => String(name).toLowerCase().includes(search.toLowerCase()) || String(hash) === search.trim());
	if (match) input.value = match[0]; else say("No matching prefab found.");
}
function renderSettings() {
	$("settingsFields").innerHTML = settings.map(([label, name, toggle]) => toggle
		? `<div class="settings-row"><label>${label}</label><button data-setting="${name}" data-value="true">On</button><button data-setting="${name}" data-value="false">Off</button></div>`
		: `<div class="settings-row"><label>${label}</label><input id="setting-${name}" placeholder="Value"><button data-setting="${name}">Set</button></div>`).join("");
	$("settingsFields").addEventListener("click", event => {
		const button = event.target.closest("[data-setting]"); if (!button) return;
		const value = button.dataset.value ?? $(`setting-${button.dataset.setting}`).value.trim();
		if (value) command(`settings changesetting server ${button.dataset.setting} ${value}`);
	});
}
function renderMacros() {
	$("macroCount").textContent = `${state.macros.length} macro${state.macros.length === 1 ? "" : "s"}`;
	$("macroList").innerHTML = state.macros.length ? state.macros.map((macro, index) => `<article class="macro-card"><div><h3>${escapeHtml(macro.name)}</h3><code>${escapeHtml(macro.commands.join(" ⏎ "))}</code></div><div class="button-row"><button data-run-macro="${index}" class="primary">▶ Run</button><button data-edit-macro="${index}">✏ Edit</button><button data-delete-macro="${index}" class="danger">🗑 Delete</button></div></article>`).join("") : '<div class="empty">No macros yet. Add one to store a reusable command list.</div>';
	localStorage.setItem("tavernkeeper-macros", JSON.stringify(state.macros));
}
function editMacro(index) {
	const current = state.macros[index] || { name: "", commands: [] };
	const name = prompt("Macro name:", current.name); if (!name || !name.trim()) return;
	const commands = prompt("Commands (one per line; use {target}):", current.commands.join("\n"));
	if (!commands || !commands.trim()) return;
	state.macros[index] = { name: name.trim(), commands: commands.split(/\r?\n/).map(line => line.trim()).filter(Boolean) }; renderMacros();
}
function renderStats() {
	$("stats").innerHTML = stats.map(([name, label, min, max]) => `<div class="stat-card"><label>${label}</label><div class="button-row"><input id="stat-${name}" type="number" min="${min}" max="${max}" step="any" placeholder="${min}-${max}"><button data-stat="${name}">Set</button></div></div>`).join("");
}
function renderTeleports() { $("quickTeleport").innerHTML = teleports.map(([label, destination]) => `<button data-teleport="${destination}">${label}</button>`).join(""); }
function renderSaved() { $("savedList").innerHTML = state.saved.length ? state.saved.map((item, index) => `<div class="list-item ${index === 0 ? "selected" : ""}" data-saved="${index}">${escapeHtml(item.label)}</div>`).join("") : '<div class="empty">No staged items.</div>'; }
function renderNearby(items) {
	state.nearby = Array.isArray(items) ? items : [];
	$("nearbyList").innerHTML = state.nearby.length ? state.nearby.map((item, index) => {
		const id = item.EntityId ?? item.entityId ?? item.Id ?? item.id ?? item;
		const name = item.Name ?? item.name ?? item.PrefabName ?? item.prefabName ?? String(item);
		return `<div class="list-item" data-entity="${escapeHtml(id)}" data-index="${index}">${escapeHtml(name)} <span class="hint">[${escapeHtml(id)}]</span></div>`;
	}).join("") : '<div class="empty">No nearby entities returned.</div>';
}
function setSelectionHistory(id, name) {
	state.history = [{ id, name }, ...state.history.filter(item => item.id !== id)].slice(0, 50);
	$("historyList").innerHTML = state.history.map(item => `<div class="list-item" data-history="${escapeHtml(item.id)}">${escapeHtml(item.name)} <span class="hint">[${escapeHtml(item.id)}]</span></div>`).join("");
}
async function getSelectedString() {
	const result = await command("select tostring");
	return result && result.resultString && !result.resultString.startsWith("System.") ? result.resultString.trim() : null;
}
function rescaleSpawnString(value, scale) {
	try {
		const parts = value.split("|"), words = parts[0].split(","), buffer = new ArrayBuffer(4), view = new DataView(buffer);
		view.setFloat32(0, scale); words[10] = String(view.getUint32(0)); parts[0] = words.join(","); return parts.join("|");
	} catch { return null; }
}
function setup() {
	document.querySelectorAll(".tab").forEach(button => button.addEventListener("click", () => { document.querySelectorAll(".tab,.view").forEach(item => item.classList.remove("active")); button.classList.add("active"); $(button.dataset.view).classList.add("active"); }));
	$("connect").onclick = async () => { try { await api("/api/connect", { method: "POST" }); say("Connected"); await refreshPlayers(); } catch (error) { say(error.message); } await status(); };
	$("disconnect").onclick = async () => { await api("/api/disconnect", { method: "POST" }); say("Disconnected"); await status(); };
	$("refreshPlayers").onclick = refreshPlayers;
	$("browsePrefabs").onclick = () => prefabPicker($("spawnPrefab")); $("browseSelectPrefabs").onclick = () => prefabPicker($("selectPrefab"));
	bindCommand("spawn", () => { const player = target(), prefab = $("spawnPrefab").value.trim(); return player && prefab ? `spawn ${quote(player)} ${quote(prefab)} ${$("spawnArgs").value.trim()}`.trim() : null; });
	bindCommand("selectNearest", () => { const player = target(), prefab = $("selectPrefab").value.trim(); return player && prefab ? `select prefab ${prefab} ${quote(player)}` : null; });
	$("findNearby").onclick = async () => { const player = target(); if (!player) return; const result = await command(`select find ${quote(player)} ${$("diameter").value}`); renderNearby(result?.result); };
	[["getString","select tostring"],["snapGround","select snap-ground"],["lookAt",() => `select look-at ${quote(target() || "")}`],["unselect","select unselect"],["destroySelection","select destroy"],["toggleTime","time toggle"],["setTime",() => `time set ${$("serverTime").value.replace(":", ".")}`],["kick",() => `player kick ${quote(target() || "")}`],["kill",() => `player kill ${quote(target() || "")}`],["teleport",() => `player teleport ${quote(target() || "")} ${quote($("teleportTarget").value.trim())}`],["setHome",() => `player set-home ${quote(target() || "")} ${quote($("homeValue").value.trim())}`],["sendMessage",() => `player message ${quote(target() || "")} ${quote($("adminMessage").value.trim())} ${$("messageDuration").value}`],["sendAll",() => `player message * ${quote($("adminMessage").value.trim())} ${$("messageDuration").value}`]].forEach(([id, value]) => bindCommand(id, () => typeof value === "function" ? value() : value));
	document.querySelectorAll("[data-move]").forEach(button => button.onclick = () => command(`select move ${button.dataset.move} ${$("moveAmount").value}`));
	document.querySelectorAll("[data-rotate]").forEach(button => button.onclick = () => { const [axis, sign] = button.dataset.rotate.split(" "); command(`select rotate ${axis} ${sign === "+" ? $("rotateDegrees").value : -Number($("rotateDegrees").value)}`); });
	$("cloneSelection").onclick = async () => { const value = await getSelectedString(); if (value) command(`spawn string-raw ${quote(value)}`); };
	$("scaleDown").onclick = () => $("scale").value = Math.max(.01, Number($("scale").value) - .25).toFixed(2); $("scaleUp").onclick = () => $("scale").value = Math.min(10.23, Number($("scale").value) + .25).toFixed(2);
	$("setScale").onclick = async () => { const value = await getSelectedString(), scale = Math.max(.01, Math.min(10.23, Number($("scale").value))); const rescaled = value && rescaleSpawnString(value, scale), player = target(); if (rescaled && player) { await command("select destroy"); command(`spawn string ${quote(player)} ${quote(rescaled)}`); } else if (!value) say("Select an object first."); };
	$("getString").onclick = async () => { const value = await getSelectedString(); if (value) say(value); };
	$("nearbyList").onclick = event => { const item = event.target.closest("[data-entity]"); if (item) { command(`select ${item.dataset.entity}`); setSelectionHistory(item.dataset.entity, item.textContent.trim()); } };
	$("historyList").onclick = event => { const item = event.target.closest("[data-history]"); if (item) command(`select ${item.dataset.history}`); };
	$("clearHistory").onclick = () => { state.history = []; $("historyList").innerHTML = '<div class="empty">No selection history.</div>'; };
	teleports.forEach(() => {}); $("quickTeleport").addEventListener("click", event => { const button = event.target.closest("[data-teleport]"); if (button && target()) command(`player teleport ${quote(target())} ${button.dataset.teleport}`); });
	$("addSaved").onclick = async () => { const result = await command("select tostring"); if (result?.resultString && !result.resultString.startsWith("System.")) { state.saved.push({ label: `Item ${state.saved.length + 1}`, spawnString: result.resultString.trim() }); renderSaved(); } };
	$("removeSaved").onclick = () => { const selected = $("savedList").querySelector(".selected"); if (selected) { state.saved.splice(Number(selected.dataset.saved), 1); renderSaved(); } };
	$("savedList").onclick = event => { const item = event.target.closest("[data-saved]"); if (item) { document.querySelectorAll("[data-saved]").forEach(node => node.classList.remove("selected")); item.classList.add("selected"); } };
	$("spawnSaved").onclick = async () => { for (const item of state.saved) await command(`spawn string-raw ${quote(item.spawnString)}`); };
	$("saveFile").onclick = () => { const blob = new Blob([JSON.stringify(state.saved, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "tavernkeeper-save.json"; link.click(); URL.revokeObjectURL(link.href); };
	$("loadFile").onclick = () => $("loadFileInput").click(); $("loadFileInput").onchange = async event => { const text = await event.target.files[0].text(); state.saved = JSON.parse(text); renderSaved(); };
	$("addMacro").onclick = () => editMacro(state.macros.length); $("refreshMacros").onclick = renderMacros;
	$("macroList").onclick = event => { const button = event.target.closest("button"); if (!button) return; const index = Number(Object.values(button.dataset)[0]); if (button.dataset.runMacro !== undefined) { let commands = state.macros[index].commands; const player = $("player").value; commands.forEach(item => command(item.replaceAll("{target}", player).replaceAll("{player}", player).replaceAll("{username}", player))); } else if (button.dataset.editMacro !== undefined) editMacro(index); else { state.macros.splice(index, 1); renderMacros(); } };
	$("refreshStats").onclick = () => command(`player list-stats ${quote(target() || "")}`); $("stats").addEventListener("click", event => { const button = event.target.closest("[data-stat]"); if (button && target()) command(`player set-stat ${quote(target())} ${button.dataset.stat} ${$(`stat-${button.dataset.stat}`).value}`); });
	renderSettings(); renderStats(); renderTeleports(); renderSaved(); renderMacros(); status(); setInterval(status, 3000);
}
setup();
