const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const { TavernClient, readToken, CONSOLE_EVENT_TYPES } = require("tavern-client");

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.TAVERN_HOST || "127.0.0.1";
const tavernPort = Number(process.env.TAVERN_PORT || 1760);
const tokenPath = process.env.TAVERN_TOKEN_PATH || path.join(
	process.env.APPDATA || path.join(process.env.USERPROFILE || process.cwd(), "AppData", "Roaming"),
	"TheModdingTavern",
	"console_token.txt"
);
const usersPath = process.env.TAVERN_USERS_PATH || path.join(
	process.env.APPDATA || path.join(process.env.USERPROFILE || process.cwd(), "AppData", "Roaming"),
	"TheModdingTavern",
	"users.json"
);
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

let client = null;
let lastError = null;
const consoleLines = [];

function addConsoleLine(text) {
	consoleLines.push(String(text));
	if (consoleLines.length > 200) consoleLines.shift();
}

function currentToken() {
	return String(tokenPath ? readToken(tokenPath) : readToken()).trim();
}

function tokensMatch(left, right) {
	const a = Buffer.from(String(left));
	const b = Buffer.from(String(right));
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function loadUsers() {
	const contents = fs.readFileSync(usersPath, "utf8").replace(/^\uFEFF/, "");
	const parsed = JSON.parse(contents);
	if (!parsed || typeof parsed !== "object" || !parsed.users || typeof parsed.users !== "object" || Array.isArray(parsed.users)) {
		throw new Error("users.json must contain a users object");
	}
	return parsed.users;
}

function findUser(username, token) {
	const users = loadUsers();
	const key = String(username || "").trim().toLowerCase();
	const user = users[key];
	if (!user || typeof user !== "object" || !tokensMatch(token, user.token)) return null;
	return {
		username: key,
		userId: user.user_id,
		roles: Array.isArray(user.roles) ? user.roles.map(String) : []
	};
}

function createClient() {
	const tavern = new TavernClient({
		host,
		port: tavernPort,
		token: () => currentToken(),
		log: (level, message) => addConsoleLine(`[${level}] ${message}`)
	});
	tavern.on("ready", () => {
		lastError = null;
		addConsoleLine("[ready] Connected to TavernLib");
	});
	tavern.on("close", reason => addConsoleLine(`[close] ${reason}`));
	tavern.on("line", line => addConsoleLine(line));
	tavern.on("event", event => addConsoleLine(`[event:${event.type}] ${JSON.stringify(event.data)}`));
	tavern.on("rejected", reason => {
		lastError = reason;
		addConsoleLine(`[rejected] ${reason}`);
	});
	tavern.on("error", error => {
		lastError = error.message;
		addConsoleLine(`[error] ${error.message}`);
	});
	return tavern;
}

function getClient() {
	if (!client) client = createClient();
	return client;
}

async function connectedClient() {
	const tavern = getClient();
	if (!tavern.connected) await tavern.connect();
	return tavern;
}

function requireAuth(req, res, next) {
	if (req.session.authenticated) return next();
	if (req.originalUrl.startsWith("/api/")) return res.status(401).json({ error: "Authentication required" });
	res.redirect("/login");
}

app.set("view engine", "ejs");
app.set("views", `${__dirname}/views`);
app.use(express.static(`${__dirname}/public`));
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "32kb" }));
app.use(session({
	secret: sessionSecret,
	resave: false,
	saveUninitialized: false,
	cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" }
}));

app.get("/login", (req, res) => {
	if (req.session.authenticated) return res.redirect("/");
	res.render("login", { error: null });
});

app.post("/login", (req, res) => {
	const username = String(req.body.username || "");
	const supplied = String(req.body.token || "");
	try {
		const user = findUser(username, supplied);
		if (!user) return res.status(401).render("login", { error: "Invalid username or user token." });
		req.session.regenerate(error => {
			if (error) return res.status(500).render("login", { error: "Unable to start a secure session." });
			req.session.authenticated = true;
			req.session.user = user;
			res.redirect("/");
		});
	} catch (error) {
		console.error(`Unable to read users registry: ${error.message}`);
		return res.status(503).render("login", { error: "The users registry could not be read." });
	}
});

app.post("/logout", (req, res) => {
	req.session.destroy(() => res.redirect("/login"));
});

app.get("/", requireAuth, (req, res) => res.render("index", {
	host,
	tavernPort,
	events: CONSOLE_EVENT_TYPES,
	user: req.session.user
}));

app.use("/api", requireAuth);

app.get("/api/status", (req, res) => res.json({
	connected: Boolean(client && client.connected),
	host,
	port: tavernPort,
	lastError,
	lines: consoleLines
}));

app.post("/api/connect", async (req, res) => {
	try {
		await connectedClient();
		res.json({ connected: true });
	} catch (error) {
		lastError = error.message;
		res.status(502).json({ error: `Connection failed: ${error.message}` });
	}
});

app.post("/api/disconnect", (req, res) => {
	if (client) client.close();
	res.json({ connected: false });
});

app.get("/api/players", async (req, res) => {
	try {
		res.json({ players: await (await connectedClient()).players() });
	} catch (error) {
		res.status(502).json({ error: error.message });
	}
});

app.post("/api/message", async (req, res) => {
	const player = String(req.body.player || "").trim();
	const text = String(req.body.text || "").trim();
	if (!player || !text) return res.status(400).json({ error: "Player and message are required" });
	try {
		res.json(await (await connectedClient()).message(player, text));
	} catch (error) {
		res.status(502).json({ error: error.message });
	}
});

app.post("/api/command", async (req, res) => {
	const command = String(req.body.command || "").trim();
	if (!command) return res.status(400).json({ error: "Command is required" });
	try {
		const result = await (await connectedClient()).command(command);
		if (result.error) return res.status(400).json(result);
		res.json(result);
	} catch (error) {
		res.status(502).json({ error: error.message });
	}
});

app.post("/api/subscribe", async (req, res) => {
	const event = String(req.body.event || "").trim();
	if (!CONSOLE_EVENT_TYPES.includes(event)) return res.status(400).json({ error: "Choose a supported console event" });
	try {
		res.json({ event, outcome: await (await connectedClient()).subscribe(event) });
	} catch (error) {
		res.status(502).json({ error: error.message });
	}
});

app.listen(port, () => console.log(`TavernKeeper Web listening at http://localhost:${port}`));
