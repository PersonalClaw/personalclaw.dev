export type AppCategory =
  | "Models"
  | "Search"
  | "Agents"
  | "Tools"
  | "Speech"
  | "Channels"
  | "Actions"
  | "Skills"
  | "Products";

export type App = {
  slug: string;
  name: string;
  category: AppCategory;
  description: string;
  tags: string[];
  local?: boolean;
  keyless?: boolean;
};

export const appCategories: Array<"All" | AppCategory> = [
  "All",
  "Models",
  "Search",
  "Agents",
  "Tools",
  "Speech",
  "Channels",
  "Actions",
  "Skills",
  "Products"
];

export const apps: App[] = [
  {
    slug: "alibaba-models",
    name: "Alibaba Model Studio",
    category: "Models",
    description: "Qwen chat, embedding, image generation, video generation, and more through DashScope.",
    tags: ["Qwen", "Embedding", "Image", "Video"]
  },
  {
    slug: "anthropic-compatible",
    name: "Anthropic-Compatible",
    category: "Models",
    description: "Connect any endpoint that implements the Anthropic Messages API.",
    tags: ["Chat", "Compatible"]
  },
  {
    slug: "anthropic-models",
    name: "Anthropic",
    category: "Models",
    description: "Claude chat models through the Anthropic Messages API.",
    tags: ["Claude", "Chat"]
  },
  {
    slug: "bedrock-models",
    name: "Amazon Bedrock",
    category: "Models",
    description: "Chat, embedding, image, video, and speech models using your AWS credential chain.",
    tags: ["Chat", "Embedding", "Media", "Speech"]
  },
  {
    slug: "brave-search",
    name: "Brave Search",
    category: "Search",
    description: "Broad web search with ranked links, snippets, and a recency filter.",
    tags: ["Web", "Recency"]
  },
  {
    slug: "claude-code-agent",
    name: "Claude Code",
    category: "Agents",
    description: "Run Claude Code over ACP with every tool call routed through the host approval gate.",
    tags: ["ACP", "Coding", "Approvals"]
  },
  {
    slug: "codex-agent",
    name: "OpenAI Codex",
    category: "Agents",
    description: "Run the Codex CLI over ACP while PersonalClaw enforces host tool approvals.",
    tags: ["ACP", "Coding", "Approvals"]
  },
  {
    slug: "deepseek-models",
    name: "DeepSeek",
    category: "Models",
    description: "DeepSeek chat and reasoner models through its OpenAI-compatible API.",
    tags: ["Chat", "Reasoning"]
  },
  {
    slug: "diarization-onnx",
    name: "Diarization (ONNX)",
    category: "Speech",
    description: "Install-and-go local speaker diarization using sherpa-onnx.",
    tags: ["Local", "Diarization"],
    local: true,
    keyless: true
  },
  {
    slug: "diarization-pyannote",
    name: "Diarization (pyannote)",
    category: "Speech",
    description: "High-accuracy speaker diarization using the pyannote.audio pretrained pipeline.",
    tags: ["Diarization", "Local"],
    local: true
  },
  {
    slug: "duckduckgo-search",
    name: "DuckDuckGo",
    category: "Search",
    description: "Keyless, zero-config web search with links and snippets.",
    tags: ["Web", "Keyless"],
    keyless: true
  },
  {
    slug: "exa-search",
    name: "Exa",
    category: "Search",
    description: "Semantic web search with relevant highlights and extracted content.",
    tags: ["Semantic", "Extract"]
  },
  {
    slug: "fal-image",
    name: "FAL",
    category: "Models",
    description: "Hosted image and video generation across FAL's model catalog.",
    tags: ["Image", "Video"]
  },
  {
    slug: "faster-whisper",
    name: "Faster Whisper",
    category: "Speech",
    description: "Local speech-to-text with CTranslate2-optimized Whisper models.",
    tags: ["STT", "Local"],
    local: true,
    keyless: true
  },
  {
    slug: "google-models",
    name: "Google Gemini",
    category: "Models",
    description: "Gemini chat, embedding, image, video, and text-to-speech models.",
    tags: ["Chat", "Embedding", "Media"]
  },
  {
    slug: "groq-models",
    name: "Groq",
    category: "Models",
    description: "Low-latency chat inference using Groq's OpenAI-compatible API.",
    tags: ["Chat", "Fast"]
  },
  {
    slug: "growth",
    name: "Growth Tracker",
    category: "Products",
    description: "Turn real work into evidenced growth artifacts and a shareable accomplishment document.",
    tags: ["Career", "Projects", "Tasks"]
  },
  {
    slug: "kiro-cli-agent",
    name: "Kiro CLI",
    category: "Agents",
    description: "Run the Kiro CLI agent over ACP when the local binary is available.",
    tags: ["ACP", "Coding"],
    local: true
  },
  {
    slug: "mcp-tools",
    name: "MCP Tool Servers",
    category: "Tools",
    description: "Connect Model Context Protocol servers over stdio or SSE transport.",
    tags: ["MCP", "stdio", "SSE"]
  },
  {
    slug: "meta-muse-spark",
    name: "Meta Muse Spark",
    category: "Models",
    description: "Meta Muse Spark chat models through the Meta AI API.",
    tags: ["Chat", "Compatible"]
  },
  {
    slug: "minutes",
    name: "Minutes",
    category: "Products",
    description: "Combine recordings, notes, transcripts, decisions, and action items on one meeting timeline.",
    tags: ["Meetings", "Transcription", "Tasks"]
  },
  {
    slug: "mistral-models",
    name: "Mistral AI",
    category: "Models",
    description: "Mistral models through its OpenAI-compatible endpoint.",
    tags: ["Chat", "Compatible"]
  },
  {
    slug: "ollama-models",
    name: "Ollama",
    category: "Models",
    description: "Use local or remote Ollama models for chat and embedding.",
    tags: ["Chat", "Embedding", "Local"],
    local: true,
    keyless: true
  },
  {
    slug: "openai-compatible",
    name: "OpenAI-Compatible",
    category: "Models",
    description: "Connect a self-hosted, proxied, or unlisted Chat Completions endpoint.",
    tags: ["Chat", "Compatible"]
  },
  {
    slug: "openai-models",
    name: "OpenAI",
    category: "Models",
    description: "OpenAI chat, vision, code-tool, and embedding models.",
    tags: ["Chat", "Vision", "Embedding"]
  },
  {
    slug: "openai-tools",
    name: "OpenAI Tool Servers",
    category: "Tools",
    description: "Connect OpenAI-compatible tool servers that expose tools over REST.",
    tags: ["Tools", "REST"]
  },
  {
    slug: "perplexity-search",
    name: "Perplexity Sonar",
    category: "Search",
    description: "Answer-first live web search with synthesized responses and cited sources.",
    tags: ["Answers", "Citations"]
  },
  {
    slug: "piper-tts",
    name: "Piper TTS",
    category: "Speech",
    description: "Local neural text-to-speech with downloadable Piper voices.",
    tags: ["TTS", "Local"],
    local: true,
    keyless: true
  },
  {
    slug: "searxng-search",
    name: "SearXNG",
    category: "Search",
    description: "Private, keyless meta-search through your own SearXNG instance.",
    tags: ["Self-hosted", "Keyless"],
    local: true,
    keyless: true
  },
  {
    slug: "sentence-transformers",
    name: "Sentence Transformers",
    category: "Models",
    description: "Run text embedding models in-process on your own machine.",
    tags: ["Embedding", "Local"],
    local: true,
    keyless: true
  },
  {
    slug: "skills-sh",
    name: "Skills.sh Marketplace",
    category: "Skills",
    description: "Search, preview, install, and manage community skills from skills.sh.",
    tags: ["Skills", "Marketplace"]
  },
  {
    slug: "slack-channel",
    name: "Slack Channel",
    category: "Channels",
    description: "Monitor Slack channels, respond to mentions, and participate in threads.",
    tags: ["Messaging", "Threads"]
  },
  {
    slug: "tavily-search",
    name: "Tavily",
    category: "Search",
    description: "Agent-oriented search with synthesized answers, scored results, and page extraction.",
    tags: ["Answers", "Extract"]
  },
  {
    slug: "together-models",
    name: "Together AI",
    category: "Models",
    description: "Serverless model inference through Together AI's compatible API.",
    tags: ["Chat", "Compatible"]
  },
  {
    slug: "vllm-models",
    name: "vLLM",
    category: "Models",
    description: "Connect a local vLLM server through its OpenAI-compatible endpoint.",
    tags: ["Chat", "Local"],
    local: true,
    keyless: true
  },
  {
    slug: "web-tools",
    name: "Native Tools (Web)",
    category: "Tools",
    description: "Give agents guarded web search, fetch, and structured extraction primitives.",
    tags: ["Search", "Fetch", "Extract"]
  },
  {
    slug: "webhook-action",
    name: "HTTP Webhook Hooks",
    category: "Actions",
    description: "Send templated agent lifecycle events to an HTTP endpoint.",
    tags: ["Webhook", "Automation"]
  },
  {
    slug: "wikipedia-search",
    name: "Wikipedia Search",
    category: "Search",
    description: "Keyless encyclopedic search with ranked articles and introductory extracts.",
    tags: ["Reference", "Keyless"],
    keyless: true
  }
];
