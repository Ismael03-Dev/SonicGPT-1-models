const ALLOWED_MODELS = ["flux", "flux-realism", "flux-anime", "flux-3d", "turbo"];

function checkAuth(req) {
    const secret = process.env.API_SECRET;
    if (!secret) return true;
    const header = req.headers.authorization || "";
    const provided = header.startsWith("Bearer ") ? header.slice(7) : null;
    return provided === secret;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    }

    if (!checkAuth(req)) {
        return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const body = req.body || {};
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt) {
        return res.status(400).json({ error: "MISSING_PROMPT" });
    }

    const width = Number.isInteger(body.width) ? body.width : 1024;
    const height = Number.isInteger(body.height) ? body.height : 1024;
    const model = ALLOWED_MODELS.includes(body.model) ? body.model : "flux";
    const seed = Number.isInteger(body.seed) ? body.seed : Math.floor(Math.random() * 1000000);

    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            return res.status(response.status).json({ error: "POLLINATIONS_ERROR" });
        }

        const arrayBuffer = await response.arrayBuffer();
        const b64_json = Buffer.from(arrayBuffer).toString("base64");

        return res.status(200).json({
            images: [{ b64_json, seed }]
        });
    } catch (e) {
        return res.status(500).json({ error: "SERVER_ERROR", details: e.message });
    }
}
