const express = require("express");
const router = express.Router();
const { chat } = require("../services/llmService");

// UC4: Chat with Gemini-powered assistant
router.post("/chat", async (req, res, next) => {
  try {
    const { messages, systemPrompt } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }
    const result = await chat({ messages, systemPrompt });
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
