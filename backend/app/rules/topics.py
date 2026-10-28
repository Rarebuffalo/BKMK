"""Topic taxonomy. Mirrors frontend/src/domain/topics.ts (keep both in sync)."""

from dataclasses import dataclass


@dataclass(frozen=True)
class TopicDef:
    id: str
    label: str
    family: str
    keywords: tuple[str, ...]


TOPICS: tuple[TopicDef, ...] = (
    TopicDef(
        "ai",
        "AI & Machine Learning",
        "build",
        (
            "llm",
            "model",
            "agent",
            "prompt",
            "fine-tun",
            "embedding",
            "inference",
            "transformer",
            "eval",
            "rag",
            "diffusion",
            "gpu",
            "token",
        ),
    ),
    TopicDef(
        "engineering",
        "Software Engineering",
        "build",
        (
            "postgres",
            "database",
            "rust",
            "typescript",
            "react",
            "api",
            "latency",
            "architecture",
            "refactor",
            "backend",
            "frontend",
            "kubernetes",
            "cache",
            "sql",
            "compiler",
            "distributed",
        ),
    ),
    TopicDef(
        "devtools",
        "Developer Tools",
        "build",
        (
            "cli",
            "open source",
            "open-source",
            "library",
            "editor",
            "terminal",
            "vscode",
            "neovim",
            "plugin",
            "devtool",
            "npm",
            "repo",
            "starter",
        ),
    ),
    TopicDef(
        "startups",
        "Startups & Founders",
        "business",
        (
            "startup",
            "founder",
            "fundraising",
            "seed round",
            "yc",
            "pricing",
            "mrr",
            "customers",
            "saas",
            "bootstrapp",
            "pmf",
            "product-market",
        ),
    ),
    TopicDef(
        "growth",
        "Marketing & Growth",
        "business",
        (
            "marketing",
            "growth",
            "seo",
            "copywriting",
            "launch",
            "audience",
            "newsletter",
            "conversion",
            "landing page",
            "distribution",
            "viral",
        ),
    ),
    TopicDef(
        "design",
        "Design",
        "craft",
        ("design", "typography", "figma", "ui", "ux", "font", "color", "colour", "layout", "animation", "interaction"),
    ),
    TopicDef(
        "security",
        "Security",
        "build",
        (
            "security",
            "vulnerability",
            "cve",
            "exploit",
            "auth",
            "oauth",
            "encryption",
            "phishing",
            "supply chain",
            "pentest",
        ),
    ),
    TopicDef(
        "research",
        "Research & Science",
        "knowledge",
        (
            "paper",
            "study",
            "research",
            "arxiv",
            "dataset",
            "physics",
            "biology",
            "neuroscience",
            "experiment",
            "survey",
        ),
    ),
    TopicDef(
        "productivity",
        "Productivity & Learning",
        "craft",
        (
            "productivity",
            "habit",
            "notes",
            "focus",
            "learning",
            "reading",
            "writing",
            "deep work",
            "routine",
            "second brain",
        ),
    ),
    TopicDef("other", "Unsorted", "none", ()),
)

TOPIC_IDS: tuple[str, ...] = tuple(t.id for t in TOPICS)
TOPIC_BY_ID = {t.id: t for t in TOPICS}
CONTENT_TYPES: tuple[str, ...] = ("post", "thread", "article", "repo", "paper", "video", "tool")
