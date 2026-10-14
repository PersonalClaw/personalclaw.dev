export type AppCategory =
  | "Models"
  | "Search"
  | "Agents"
  | "Tools"
  | "Speech"
  | "Channels"
  | "Inboxes"
  | "Knowledge"
  | "Automation"
  | "Sync"
  | "Sandboxes"
  | "Skills"
  | "Products"
  | "Companions";

export type App = {
  slug: string;
  name: string;
  category: AppCategory;
  description: string;
  tags: string[];
  local?: boolean;
  keyless?: boolean;
};

/* `local` and `keyless` are the two structured claims this registry makes, and they are
   the per-app evidence behind the "0 Required cloud vendors" stat on the apps page. They
   had no consumer: every card rendered `tags` only, so both facts were hand-copied into
   free text and drifted. Measured on the previous commit: 6 of the 9 keyless apps carried
   no "Keyless" tag, 2 of the 9 local apps carried no "Local" tag, and none of the three
   keyless Speech apps said so at all. Derive the chips from the fields instead; the fields
   stay the single place a claim is made. */
const appFactChips = [
  { field: "local", label: "Local" },
  { field: "keyless", label: "Keyless" }
] as const satisfies ReadonlyArray<{ field: keyof App; label: string }>;

/** The labels a card shows for the boolean claims its registry entry declares. */
export function appFacts(app: App): string[] {
  return appFactChips.filter(({ field }) => app[field]).map(({ label }) => label);
}

/** Every label `appFacts` can emit — the strings `tags` must therefore never repeat. */
export const appFactLabels: string[] = appFactChips.map(({ label }) => label);

export const appCategories: Array<"All" | AppCategory> = [
  "All",
  "Models",
  "Search",
  "Agents",
  "Tools",
  "Speech",
  "Channels",
  "Inboxes",
  "Knowledge",
  "Automation",
  "Sync",
  "Sandboxes",
  "Skills",
  "Products",
  "Companions"
];

export const apps: App[] = [
  {
    slug: "a2a-action",
    name: "A2A Agent Call",
    category: "Automation",
    description: "Hand one task to an external A2A agent when a trigger fires, on hosts you allow-list.",
    tags: ["A2A", "Triggers"]
  },
  {
    slug: "alibaba-models",
    name: "Alibaba Model Studio",
    category: "Models",
    description: "Qwen chat, vision, and embedding models, plus image generation, through DashScope.",
    tags: ["Qwen", "Embedding", "Image"]
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
    slug: "browser-connector",
    name: "Browser Connector",
    category: "Companions",
    description: "Let a browse task act in your own signed-in browser, only in a tab it opens for itself.",
    tags: ["Extension", "Browse"]
  },
  {
    slug: "claude-code-agent",
    name: "Claude Code",
    category: "Agents",
    description: "Run Claude Code over ACP in a config of its own; every tool beyond its own reads asks the host approval gate.",
    tags: ["ACP", "Coding", "Approvals"]
  },
  {
    slug: "claude-subscription",
    name: "Claude (Subscription)",
    category: "Models",
    description: "Claude models over your existing Claude Code sign-in, with no API key.",
    tags: ["Claude", "Chat", "Subscription"]
  },
  {
    slug: "code-review",
    name: "Code Review",
    category: "Tools",
    description: "Review a GitHub pull request file by file, riskiest changes first; nothing is posted back.",
    tags: ["GitHub", "Review"]
  },
  {
    slug: "codex-agent",
    name: "OpenAI Codex",
    category: "Agents",
    description: "Run the Codex CLI over ACP while PersonalClaw enforces host tool approvals.",
    tags: ["ACP", "Coding", "Approvals"]
  },
  {
    slug: "companion",
    name: "Companion",
    category: "Tools",
    description: "Opt-in reminders, a folder watchlist, and a day plan, each off until you turn it on.",
    tags: ["Reminders", "Watchlist"]
  },
  {
    slug: "deepseek-models",
    name: "DeepSeek",
    category: "Models",
    description: "DeepSeek chat and reasoner models through its OpenAI-compatible API.",
    tags: ["Chat", "Reasoning"]
  },
  {
    slug: "design-critique",
    name: "Design Critique",
    category: "Tools",
    description: "Accessibility and craft findings for a URL or screenshot, each with the change that clears it.",
    tags: ["Accessibility", "Review"]
  },
  {
    slug: "diarization-onnx",
    name: "Diarization (ONNX)",
    category: "Speech",
    description: "Install-and-go local speaker diarization using sherpa-onnx.",
    tags: ["Diarization"],
    local: true,
    keyless: true
  },
  {
    slug: "diarization-pyannote",
    name: "Diarization (pyannote)",
    category: "Speech",
    description: "High-accuracy speaker diarization using the pyannote.audio pretrained pipeline.",
    tags: ["Diarization"],
    local: true
  },
  {
    slug: "dir-notification",
    name: "Folder Notification Drop",
    category: "Channels",
    description: "Deliver teammate-addressed notifications into a shared folder, for a roster you declare.",
    tags: ["Team", "Folder"]
  },
  {
    slug: "dir-sync",
    name: "Folder Sync",
    category: "Sync",
    description: "Sync state between your machines through a shared or synced folder, with no server.",
    tags: ["Folder", "NFS", "USB"]
  },
  {
    slug: "discord-channel",
    name: "Discord Channel",
    category: "Channels",
    description: "Pair a DM, converse in servers, and answer approvals with buttons through a Discord bot.",
    tags: ["Messaging", "Threads", "Reactions"]
  },
  {
    slug: "docs-slides",
    name: "Docs & Slides",
    category: "Tools",
    description: "Turn a markdown brief into a PowerPoint deck or a Word or PDF document on your machine.",
    tags: ["PPTX", "DOCX", "PDF"]
  },
  {
    slug: "duckduckgo-search",
    name: "DuckDuckGo",
    category: "Search",
    description: "Keyless, zero-config web search with links and snippets.",
    tags: ["Web"],
    keyless: true
  },
  {
    slug: "email-channel",
    name: "Email Channel",
    category: "Channels",
    description: "Converse with your agent by email over IMAP and SMTP, with replies threaded back.",
    tags: ["Email", "Threads"]
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
    tags: ["STT"],
    local: true,
    keyless: true
  },
  {
    slug: "gemini-cli-agent",
    name: "Gemini CLI",
    category: "Agents",
    description: "Run Google's Gemini CLI over ACP with its own sign-in; PersonalClaw stores no key.",
    tags: ["ACP", "Coding"]
  },
  {
    slug: "git-repo",
    name: "Git Repository",
    category: "Knowledge",
    description: "Index a git repository's code and docs into your knowledge library, re-reading only changed files.",
    tags: ["Git", "Code", "Docs"]
  },
  {
    slug: "git-sync",
    name: "Git Sync",
    category: "Sync",
    description: "Sync state between your machines through a git remote you own, as a readable history.",
    tags: ["Git", "Audit"]
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
    slug: "inbox-github-notifications",
    name: "GitHub Notifications Inbox",
    category: "Inboxes",
    description: "Your GitHub notifications as read-only inbox items to triage.",
    tags: ["GitHub", "Notifications"]
  },
  {
    slug: "issue-radar",
    name: "Issue Radar",
    category: "Tools",
    description: "Triage a repository's open issues through gh or glab without changing the tracker.",
    tags: ["GitHub", "GitLab", "Triage"]
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
    slug: "lima-sandbox",
    name: "Lima Sandbox",
    category: "Sandboxes",
    description: "Run agent-influenced commands inside a Lima virtual machine instead of on the host.",
    tags: ["VM", "Isolation"]
  },
  {
    slug: "local-image-gen",
    name: "Local Image Generation",
    category: "Models",
    description: "Generate images with a ComfyUI server you run on your own machine.",
    tags: ["Image", "ComfyUI"],
    local: true,
    keyless: true
  },
  {
    slug: "mail-inbox",
    name: "Mail Inbox",
    category: "Inboxes",
    description: "IMAP mail from a sender allowlist as inbox items, with threaded reply drafts.",
    tags: ["Email", "Attachments"]
  },
  {
    slug: "menu-bar-companion",
    name: "Menu Bar Companion",
    category: "Companions",
    description: "Running loops and waiting approvals in your Mac's menu bar.",
    tags: ["macOS", "Approvals"]
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
    slug: "notes",
    name: "Notes",
    category: "Tools",
    description: "A git-backed markdown notebook whose notes stay plain files on your machine.",
    tags: ["Markdown", "Git"]
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
    slug: "openrouter-models",
    name: "OpenRouter",
    category: "Models",
    description: "One key for hundreds of models across providers — chat with image input, embedding, image, and video.",
    tags: ["Chat", "Vision", "Embedding", "Image", "Video"]
  },
  {
    slug: "ops",
    name: "Ops",
    category: "Tools",
    description: "An on-call responder that files alarms as incidents and works them against your runbook.",
    tags: ["On-call", "Incidents"]
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
    tags: ["TTS"],
    local: true,
    keyless: true
  },
  {
    slug: "rapidocr",
    name: "RapidOCR (Offline)",
    category: "Knowledge",
    description: "Read text from scans and screenshots offline, so a scanned page becomes searchable knowledge.",
    tags: ["OCR", "Offline"],
    local: true,
    keyless: true
  },
  {
    slug: "research-lab",
    name: "Research Lab",
    category: "Tools",
    description: "Unattended research campaigns that end in one sourced markdown report.",
    tags: ["Research", "Unattended"]
  },
  {
    slug: "rsync-sync",
    name: "Rsync Sync",
    category: "Sync",
    description: "Sync state between your machines with rsync over ssh, encrypted end to end by default.",
    tags: ["rsync", "SSH"]
  },
  {
    slug: "s3-sync",
    name: "S3 Sync",
    category: "Sync",
    description: "Sync state between your machines through an S3-compatible store you own, encrypted end to end.",
    tags: ["S3", "MinIO"]
  },
  {
    slug: "searxng-search",
    name: "SearXNG",
    category: "Search",
    description: "Private, keyless meta-search through your own SearXNG instance.",
    tags: ["Self-hosted"],
    local: true,
    keyless: true
  },
  {
    slug: "sentence-transformers",
    name: "Sentence Transformers",
    category: "Models",
    description: "Run text embedding models in-process on your own machine.",
    tags: ["Embedding"],
    local: true,
    keyless: true
  },
  {
    slug: "shared-automations",
    name: "Shared Automations",
    category: "Automation",
    description: "Serve automations from a shared file; each machine fires only its own owner's rows.",
    tags: ["Team", "Triggers"]
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
    slug: "spec-builder",
    name: "Spec Builder",
    category: "Tools",
    description: "Write a spec and compile it into a workflow definition the engine runs.",
    tags: ["Specs", "Workflows"]
  },
  {
    slug: "tavily-search",
    name: "Tavily",
    category: "Search",
    description: "Agent-oriented search with synthesized answers, scored results, and page extraction.",
    tags: ["Answers", "Extract"]
  },
  {
    slug: "telegram-channel",
    name: "Telegram Channel",
    category: "Channels",
    description: "Pair a chat and converse through a Telegram bot, with inline approvals.",
    tags: ["Messaging", "Threads"]
  },
  {
    slug: "together-models",
    name: "Together AI",
    category: "Models",
    description: "Serverless model inference through Together AI's compatible API.",
    tags: ["Chat", "Compatible"]
  },
  {
    slug: "vector-store-qdrant",
    name: "Qdrant Vector Store",
    category: "Knowledge",
    description: "Use your own Qdrant for the vector half of knowledge retrieval.",
    tags: ["Qdrant", "Retrieval"]
  },
  {
    slug: "vllm-models",
    name: "vLLM",
    category: "Models",
    description: "Connect a local vLLM server through its OpenAI-compatible endpoint.",
    tags: ["Chat"],
    local: true,
    keyless: true
  },
  {
    slug: "voice-clone-tts",
    name: "Voice Clone TTS",
    category: "Speech",
    description: "Clone a voice from a short clip and speak with it on your own machine.",
    tags: ["TTS", "Voice cloning"],
    local: true
  },
  {
    slug: "watched-source-github",
    name: "GitHub Repo Watcher",
    category: "Automation",
    description: "Fire automations when a watched GitHub repo ships a release or opens an issue.",
    tags: ["GitHub", "Releases"]
  },
  {
    slug: "web-tools",
    name: "Web Tools",
    category: "Tools",
    description: "Give agents guarded web search, fetch, and structured extraction primitives.",
    tags: ["Search", "Fetch", "Extract"]
  },
  {
    slug: "webhook-action",
    name: "HTTP Webhook Hooks",
    category: "Automation",
    description: "Send templated agent lifecycle events to an HTTP endpoint.",
    tags: ["Webhook", "Automation"]
  },
  {
    slug: "wikipedia-search",
    name: "Wikipedia Search",
    category: "Search",
    description: "Keyless encyclopedic search with ranked articles and introductory extracts.",
    tags: ["Reference"],
    keyless: true
  }
];
