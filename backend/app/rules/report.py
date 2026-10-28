"""Collection stats, Curation Score, archetype and achievement rules.

Ported from frontend/src/domain/{stats,scoring,archetypes,achievements}.ts with
identical constants and version strings. Output dicts use the frontend's
camelCase field names so the API returns the shapes the UI already renders.
"""

import math
from collections import Counter
from dataclasses import dataclass
from datetime import datetime

from .topics import CONTENT_TYPES, TOPIC_BY_ID, TOPIC_IDS

SCORE_VERSION = "score-v1"
ARCHETYPE_VERSION = "archetype-v1"
ACHIEVEMENTS_VERSION = "achievements-2026.10-v1"


@dataclass(frozen=True)
class StatItem:
    topic: str
    content_type: str
    author_handle: str
    author_name: str
    created_at: datetime | None
    accessible: bool = True


# ── stats ────────────────────────────────────────────────────────────────────


def effective_count(counts: list[int]) -> float:
    """exp(Shannon entropy): the effective number of categories."""
    total = sum(counts)
    if not total:
        return 0.0
    h = -sum((c / total) * math.log(c / total) for c in counts if c > 0)
    return math.exp(h)


def compute_stats(items: list[StatItem]) -> dict:
    accessible = [i for i in items if i.accessible]
    topic_counts = dict.fromkeys(TOPIC_IDS, 0)
    type_counts = dict.fromkeys(CONTENT_TYPES, 0)
    authors: Counter[str] = Counter()
    author_names: dict[str, str] = {}
    breakdown: dict[str, dict] = {t: {"authors": Counter(), "types": Counter()} for t in TOPIC_IDS}
    for i in accessible:
        topic_counts[i.topic] += 1
        type_counts[i.content_type] += 1
        authors[i.author_handle] += 1
        author_names[i.author_handle] = i.author_name
        breakdown[i.topic]["authors"][i.author_handle] += 1
        breakdown[i.topic]["types"][i.content_type] += 1

    classified = len(accessible) - topic_counts["other"]
    top_topics = sorted(
        (
            {"topic": t, "count": topic_counts[t], "share": topic_counts[t] / classified if classified else 0}
            for t in TOPIC_IDS
            if t != "other" and topic_counts[t] > 0
        ),
        key=lambda x: (-x["count"], x["topic"]),
    )
    dates = sorted(i.created_at for i in accessible if i.created_at)

    def author_list(counter: Counter[str], limit: int) -> list[dict]:
        ranked = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]
        return [{"author": {"handle": h, "name": author_names.get(h, h)}, "count": n} for h, n in ranked]

    return {
        "retrieved": len(items),
        "accessible": len(accessible),
        "inaccessible": len(items) - len(accessible),
        "classified": classified,
        "topicCounts": topic_counts,
        "topTopics": top_topics,
        "contentTypeCounts": type_counts,
        "threadCount": type_counts["thread"],
        "repoShare": type_counts["repo"] / len(accessible) if accessible else 0,
        "authorCount": len(authors),
        "topAuthors": author_list(authors, 8),
        "topicBreakdown": {
            t: {
                "authors": len(b["authors"]),
                "types": {k: v for k, v in b["types"].items()},
                "topAuthors": author_list(b["authors"], 4),
            }
            for t, b in breakdown.items()
            if topic_counts[t]
        },
        "oldest": dates[0].isoformat() if dates else None,
        "newest": dates[-1].isoformat() if dates else None,
    }


# ── Curation Score (score-v1) ───────────────────────────────────────────────

DEPTH_FULL_MARKS = 0.85
SUBSTANTIAL_TYPES = ("thread", "article", "repo", "paper", "video", "tool")


def _saturate(x: float, scale: float) -> float:
    return 1 - math.exp(-max(0.0, x) / scale)


def _clamp25(x: float) -> int:
    # JS Math.round semantics (half up) so scores match the frontend exactly.
    return int(math.floor(max(0.0, min(25.0, x)) + 0.5))


def compute_score(stats: dict) -> dict:
    eff_topics = effective_count([t["count"] for t in stats["topTopics"]])
    eff_types = effective_count(list(stats["contentTypeCounts"].values()))
    n = stats["accessible"]
    substantial = sum(stats["contentTypeCounts"][t] for t in SUBSTANTIAL_TYPES)
    depth_share = substantial / n if n else 0
    coverage = stats["classified"] / n if n else 0
    dims = [
        {
            "id": "exploration",
            "label": "Topic exploration",
            "value": _clamp25(25 * _saturate(eff_topics - 1, 4)),
            "explanation": f"Your saves spread across about {eff_topics:.1f} effective topics. Measured on proportions, so a larger collection does not score higher by size alone.",
        },
        {
            "id": "diversity",
            "label": "Resource diversity",
            "value": _clamp25(25 * _saturate(eff_types - 1, 2.2)),
            "explanation": f"A mix of about {eff_types:.1f} effective resource types — posts, threads, articles, repos, papers, videos and tools.",
        },
        {
            "id": "depth",
            "label": "Collection depth",
            "value": _clamp25(25 * depth_share / DEPTH_FULL_MARKS),
            "explanation": f"{round(depth_share * 100)}% of accessible bookmarks are substantial resources (threads, articles, repos, papers, videos, tools). {round(DEPTH_FULL_MARKS * 100)}% or more earns full marks.",
        },
        {
            "id": "coverage",
            "label": "Metadata coverage",
            "value": _clamp25(25 * coverage),
            "explanation": f"{round(coverage * 100)}% of accessible bookmarks could be placed in a topic. Deleted or protected posts are excluded, not penalised.",
        },
    ]
    return {"total": sum(d["value"] for d in dims), "dimensions": dims, "version": SCORE_VERSION}


# ── Archetype (archetype-v1) ─────────────────────────────────────────────────

MIN_SIGNAL = 0.35
SECONDARY_RATIO = 0.75
MIN_BOOKMARKS = 25


def derive_archetype(stats: dict, provisional: bool = False) -> dict:
    n = stats["accessible"] or 1
    classified = stats["classified"] or 1
    tc, ct = stats["topicCounts"], stats["contentTypeCounts"]

    def share(*ids: str) -> float:
        return sum(tc[i] for i in ids) / classified

    def typ(*ids: str) -> float:
        return sum(ct[i] for i in ids) / n

    def clamp(x: float) -> float:
        return max(0.0, min(1.0, x))

    top = stats["topTopics"][0]["share"] if stats["topTopics"] else 0
    eff_topics = effective_count([t["count"] for t in stats["topTopics"]])
    eff_types = effective_count(list(ct.values()))
    coverage = stats["classified"] / n
    signals = {
        "builder": clamp(share("engineering", "devtools") * 1.2 + typ("repo", "tool") * 0.8),
        "researcher": clamp(share("research", "ai") * 1.1 + typ("paper", "thread", "article") * 0.35),
        "idea-hunter": clamp(share("startups", "growth") * 1.6),
        "explorer": clamp((eff_topics - 3) / 4) if top <= 0.3 else 0.0,
        "curator": clamp(((eff_types - 2) / 3) * 0.6 + ((eff_topics - 4) / 4) * 0.5)
        if len(stats["topTopics"]) >= 6 and coverage >= 0.85
        else 0.0,
        "rabbit-hole": clamp(top + stats["threadCount"] / n)
        if top >= 0.4 and stats["threadCount"] / n >= 0.15
        else 0.0,
    }
    ranked = sorted(signals.items(), key=lambda kv: (-kv[1], kv[0]))
    result: dict = {"signals": signals, "version": ARCHETYPE_VERSION, "provisional": provisional}
    first = ranked[0]
    if first[1] < MIN_SIGNAL or stats["accessible"] < MIN_BOOKMARKS:
        result["primary"] = "collector"
        return result
    result["primary"] = first[0]
    second = ranked[1]
    if second[1] >= MIN_SIGNAL and second[1] >= first[1] * SECONDARY_RATIO:
        result["secondary"] = second[0]
    return result


# ── Achievements (achievements-2026.10-v1) ──────────────────────────────────


@dataclass(frozen=True)
class AchievementDef:
    id: str
    rarity: str


ACHIEVEMENTS: tuple[AchievementDef, ...] = (
    AchievementDef("first-scan", "common"),
    AchievementDef("bookmark-rookie", "common"),
    AchievementDef("wide-explorer", "uncommon"),
    AchievementDef("deep-diver", "uncommon"),
    AchievementDef("thread-collector", "uncommon"),
    AchievementDef("open-source-hunter", "rare"),
    AchievementDef("curiosity-engine", "rare"),
    AchievementDef("digital-archivist", "rare"),
)


def _evaluate(aid: str, s: dict) -> tuple[int, int]:
    if aid == "first-scan":
        return (1 if s["retrieved"] > 0 else 0), 1
    if aid == "bookmark-rookie":
        return s["accessible"], 25
    if aid == "wide-explorer":
        return sum(1 for t in s["topTopics"] if t["count"] >= 3), 8
    if aid == "deep-diver":
        return (s["topTopics"][0]["count"] if s["topTopics"] else 0), 50
    if aid == "thread-collector":
        return s["threadCount"], 25
    if aid == "open-source-hunter":
        return round(s["repoShare"] * 100), 15
    if aid == "curiosity-engine":
        fams: Counter[str] = Counter()
        for t in s["topTopics"]:
            fams[TOPIC_BY_ID[t["topic"]].family] += t["count"]
        return sum(1 for v in fams.values() if v >= 5), 4
    if aid == "digital-archivist":
        return s["accessible"], 500
    raise KeyError(aid)


def evaluate_achievements(stats: dict) -> list[dict]:
    out = []
    for a in ACHIEVEMENTS:
        current, target = _evaluate(a.id, stats)
        out.append({"id": a.id, "current": min(current, target), "target": target, "earned": current >= target})
    return out


def rules_version() -> str:
    from .classifier import CLASSIFIER_VERSION

    return f"{CLASSIFIER_VERSION}+{SCORE_VERSION}+{ARCHETYPE_VERSION}+{ACHIEVEMENTS_VERSION}"
