/**
 * AI Router — stubs for routing prompts to the right model.
 *
 * POST /api/ai/route   body: { prompt, intent? }
 *   intent = 'architecture' → Claude
 *   intent = 'code'         → ChatGPT
 *   intent = 'research'     → Gemini
 *   (no intent)             → auto-detect (stub)
 *
 * This is a placeholder; actual API calls will be wired later.
 */

const { Router } = require('express');
const router = Router();

// ── Model map ──────────────────────────────────────────
const MODEL_MAP = {
  architecture: { model: 'claude', provider: 'Anthropic' },
  code:         { model: 'chatgpt', provider: 'OpenAI' },
  research:     { model: 'gemini', provider: 'Google' },
};

/** Route a prompt to the appropriate AI model (stub) */
router.post('/route', (req, res) => {
  const { prompt, intent } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  // Resolve which model to use
  const resolvedIntent = intent || 'code'; // default to code
  const target = MODEL_MAP[resolvedIntent] || MODEL_MAP.code;

  // Stub response
  res.json({
    routed_to: target,
    intent: resolvedIntent,
    message: `[STUB] Would forward to ${target.model} (${target.provider}). Actual API call not yet implemented.`,
    prompt_preview: prompt.substring(0, 100),
  });
});

/** List available AI models */
router.get('/models', (_req, res) => {
  res.json({ models: MODEL_MAP });
});

module.exports = router;
