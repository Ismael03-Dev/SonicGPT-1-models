const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CACHE_TTL = 86400; // 24 heures

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY non configurée");
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const cache = new Map();

const VALID_SIZES = ["1024x1024", "1792x1024", "1024x1792"];
const VALID_QUALITIES = ["standard", "hd"];
const VALID_STYLES = ["vivid", "natural"];
const MAX_IMAGES = 4;
const DEFAULT_CONFIG = {
  size: "1024x1024",
  quality: "standard",
  style: "vivid",
  n: 1
};

function getCacheKey(prompt, options) {
  const str = `${prompt}|${options.size}|${options.quality}|${options.style}|${options.n}`;
  return crypto.createHash("md5").update(str).digest("hex");
}

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL * 1000) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
  if (cache.size > 100) {
    const keys = Array.from(cache.keys());
    for (let i = 0; i < 20; i++) cache.delete(keys[i]);
  }
}

function enhancePrompt(prompt) {
  const enhancers = [
    "4k, 8k, high quality",
    "professional photography, studio lighting",
    "digital art, highly detailed",
    "vibrant colors, sharp focus"
  ];
  const random = enhancers[Math.floor(Math.random() * enhancers.length)];
  return `${prompt}, ${random}`;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

app.get("/", (req, res) => {
  res.json({
    name: "Image API - DALL-E 3",
    version: "2.0",
    status: "online",
    cache: {
      size: cache.size,
      ttl: `${CACHE_TTL}s`
    },
    endpoints: {
      "POST /generate": "Génère une ou plusieurs images",
      "POST /generate/stream": "Génère une image avec streaming (SSE)",
      "GET /models": "Liste les modèles disponibles",
      "GET /status": "Statut de l'API",
      "DELETE /cache": "Vider le cache"
    }
  });
});

app.get("/status", (req, res) => {
  res.json({
    success: true,
    data: {
      status: "online",
      uptime: process.uptime(),
      cache: {
        entries: cache.size,
        maxEntries: 100,
        ttl: `${CACHE_TTL}s`
      },
      models: ["dall-e-3"]
    }
  });
});

app.delete("/cache", (req, res) => {
  cache.clear();
  res.json({ success: true, message: "Cache vidé" });
});

app.get("/models", (req, res) => {
  res.json({
    success: true,
    data: {
      models: [
        { id: "dall-e-3", name: "DALL-E 3", description: "Modèle le plus performant" },
        { id: "dall-e-2", name: "DALL-E 2", description: "Modèle plus rapide, moins cher" }
      ]
    }
  });
});

app.post("/generate", async (req, res) => {
  const startTime = Date.now();

  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      success: false,
      error: "OPENAI_API_KEY non configurée sur le serveur"
    });
  }

  const {
    prompt,
    size = DEFAULT_CONFIG.size,
    quality = DEFAULT_CONFIG.quality,
    style = DEFAULT_CONFIG.style,
    n = DEFAULT_CONFIG.n,
    enhance = true,
    negativePrompt = null
  } = req.body;

  // Validation
  if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
    return res.status(400).json({
      success: false,
      error: "Le champ 'prompt' est requis (minimum 3 caractères)"
    });
  }

  if (!VALID_SIZES.includes(size)) {
    return res.status(400).json({
      success: false,
      error: `Taille invalide. Options : ${VALID_SIZES.join(", ")}`
    });
  }

  if (!VALID_QUALITIES.includes(quality)) {
    return res.status(400).json({
      success: false,
      error: `Qualité invalide. Options : ${VALID_QUALITIES.join(", ")}`
    });
  }

  if (!VALID_STYLES.includes(style)) {
    return res.status(400).json({
      success: false,
      error: `Style invalide. Options : ${VALID_STYLES.join(", ")}`
    });
  }

  const count = Math.min(Math.max(1, parseInt(n, 10) || 1), MAX_IMAGES);
  const options = { size, quality, style, n: count };
  const cacheKey = getCacheKey(prompt, options);

  // Vérifier le cache
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json({
      success: true,
      data: cached,
      cached: true,
      duration: formatDuration(Date.now() - startTime)
    });
  }

  // Amélioration du prompt
  let finalPrompt = prompt.trim();
  if (enhance && !prompt.match(/(4k|8k|high quality|detailed)/i)) {
    finalPrompt = enhancePrompt(prompt);
  }

  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: finalPrompt,
      n: count,
      size: size,
      quality: quality,
      style: style
    });

    const images = response.data.map((item, index) => ({
      index: index + 1,
      url: item.url,
      revisedPrompt: item.revised_prompt || null
    }));

    const result = {
      images,
      total: images.length,
      prompt: finalPrompt,
      originalPrompt: prompt,
      size,
      quality,
      style,
      created: Math.floor(Date.now() / 1000)
    };

    setCache(cacheKey, result);

    return res.json({
      success: true,
      data: result,
      cached: false,
      duration: formatDuration(Date.now() - startTime)
    });

  } catch (err) {
    console.error("❌ Erreur DALL-E 3:", err.message);

    if (err.status === 429) {
      return res.status(429).json({
        success: false,
        error: "Limite de requêtes atteinte. Réessaie plus tard."
      });
    }

    if (err.status === 400) {
      return res.status(400).json({
        success: false,
        error: err.error?.message || "Requête invalide. Vérifie ton prompt."
      });
    }

    if (err.status === 401) {
      return res.status(401).json({
        success: false,
        error: "Clé API invalide. Vérifie ta configuration."
      });
    }

    return res.status(500).json({
      success: false,
      error: "Erreur serveur. Réessaie plus tard.",
      details: err.message
    });
  }
});

app.post("/generate/stream", async (req, res) => {
  // SSE (Server-Sent Events) pour le streaming
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const { prompt, size = "1024x1024", quality = "standard", style = "vivid" } = req.body;

  if (!prompt) {
    res.write(`data: ${JSON.stringify({ error: "Prompt requis" })}\n\n`);
    res.end();
    return;
  }

  res.write(`data: ${JSON.stringify({ status: "started", prompt })}\n\n`);

  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt.trim(),
      n: 1,
      size,
      quality,
      style
    });

    const imageUrl = response.data[0].url;

    res.write(`data: ${JSON.stringify({ status: "done", url: imageUrl, revisedPrompt: response.data[0].revised_prompt })}\n\n`);
    res.end();

  } catch (err) {
    res.write(`data: ${JSON.stringify({ status: "error", error: err.message })}\n\n`);
    res.end();
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route non trouvée" });
});

module.exports = app;
