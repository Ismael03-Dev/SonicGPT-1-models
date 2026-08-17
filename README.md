# image-api

API de génération d'images basée sur `gpt-image-1.5` (OpenAI), déployable sur Vercel.

## Variables d'environnement (à définir dans Vercel > Settings > Environment Variables)

- `OPENAI_API_KEY` — ta clé OpenAI (obligatoire)
- `API_SECRET` — clé perso pour protéger l'endpoint (optionnelle, mais recommandée si l'API est publique)

## Endpoints

### `GET /api/health`

Vérifie que le service tourne et que la clé OpenAI est bien configurée.

### `POST /api/generate`

Headers :
```
Authorization: Bearer <API_SECRET>   (si API_SECRET est défini)
Content-Type: application/json
```

Body :
```json
{
  "prompt": "un hérisson qui code sur un ordinateur portable, style pixel art",
  "size": "1024x1024",
  "quality": "medium",
  "n": 1
}
```

- `size` : `1024x1024` | `1536x1024` | `1024x1536` | `auto`
- `quality` : `high` | `medium` | `low` | `auto`
- `n` : 1 à 4
- `background` (optionnel) : `transparent` | `opaque` | `auto`
- `output_format` (optionnel) : `png` | `jpeg` | `webp`

Réponse :
```json
{
  "images": [
    { "b64_json": "iVBORw0KG...", "revised_prompt": "..." }
  ],
  "usage": { "total_tokens": 100 }
}
```

`gpt-image-1.5` ne renvoie jamais d'URL, uniquement du base64 (`b64_json`). C'est normal, ce n'est pas un bug.

## Déploiement

```bash
vercel --prod
```

Ou connecte simplement le repo GitHub à Vercel et pousse sur `main`.
