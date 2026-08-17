export default function handler(req, res) {
    return res.status(200).json({
        status: "ok",
        model: "gpt-image-1.5",
        hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY)
    });
}
