const ALLOWED_SIZES = ["1024x1024", "1536x1024", "1024x1536", "auto"];
const ALLOWED_QUALITY = ["high", "medium", "low", "auto"];
const ALLOWED_BACKGROUND = ["transparent", "opaque", "auto"];
const ALLOWED_OUTPUT_FORMAT = ["png", "jpeg", "webp"];

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

    if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "MISSING_OPENAI_KEY" });
    }

    const body = req.body || {};
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt) {
        return res.status(400).json({ error: "MISSING_PROMPT" });
    }
    if (prompt.length > 32000) {
        return res.status(400).json({ error: "PROMPT_TOO_LONG" });
    }

    const size = ALLOWED_SIZES.includes(body.size) ? body.size : "1024x1024";
    const quality = ALLOWED_QUALITY.includes(body.quality) ? body.quality : "medium";
    const background = ALLOWED_BACKGROUND.includes(body.background) ? body.background : undefined;
    const output_format = ALLOWED_OUTPUT_FORMAT.includes(body.output_format) ? body.output_format : undefined;
    const n = Number.isInteger(body.n) && body.n > 0 && body.n <= 4 ? body.n : 1;

    const payload = { model: "gpt-image-1.5", prompt, size, quality, n };
    if (background) payload.background = background;
    if (output_format) payload.output_format = output_format;

    try {
        const response = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: "OPENAI_ERROR", details: data.error || data });
        }

        const images = (data.data || []).map((img) => ({
            b64_json: img.b64_json,
            revised_prompt: img.revised_prompt || null
        }));

        return res.status(200).json({ images, usage: data.usage || null });
    } catch (e) {
        return res.status(500).json({ error: "SERVER_ERROR", details: e.message });
    }
}
