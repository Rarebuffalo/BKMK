"""Rules engine tests over fixture collections with known shapes."""

import pytest

from app.rules.classifier import ClassifierInput, classify
from app.rules.report import (
    StatItem,
    compute_score,
    compute_stats,
    derive_archetype,
    evaluate_achievements,
)


def collection(topics: dict[str, int], types: dict[str, int] | None = None, authors: int = 20) -> list[StatItem]:
    """Builds a collection with exact topic counts; content types are assigned round-robin by weight."""
    type_seq = [t for t, n in (types or {"post": 1}).items() for _ in range(n)]
    items, i = [], 0
    for topic, n in topics.items():
        for _ in range(n):
            handle = f"author{i % authors}"
            items.append(StatItem(topic, type_seq[i % len(type_seq)], handle, handle, None))
            i += 1
    return items


def report(items):
    stats = compute_stats(items)
    return stats, compute_score(stats), derive_archetype(stats), {a["id"]: a for a in evaluate_achievements(stats)}


DATASETS = {
    "developer": collection(
        {"engineering": 70, "devtools": 60, "ai": 25, "security": 10, "startups": 5, "other": 5},
        {"repo": 4, "tool": 3, "post": 3, "thread": 2, "article": 2},
    ),
    "founder": collection(
        {"startups": 60, "growth": 45, "ai": 10, "design": 8, "other": 7}, {"thread": 2, "post": 3, "article": 2}
    ),
    "specialist": collection(
        {"design": 140, "productivity": 10, "growth": 8, "other": 6}, {"thread": 2, "post": 2, "tool": 1}
    ),
    "diverse": collection(
        {
            t: 22
            for t in (
                "ai",
                "engineering",
                "devtools",
                "startups",
                "growth",
                "design",
                "security",
                "research",
                "productivity",
            )
        }
        | {"other": 2},
        {"post": 2, "thread": 2, "article": 2, "repo": 1, "paper": 1, "video": 1, "tool": 1},
    ),
    "mixed": collection(
        {
            t: 12
            for t in (
                "ai",
                "engineering",
                "devtools",
                "startups",
                "growth",
                "design",
                "security",
                "research",
                "productivity",
            )
        }
        | {"other": 60},
        {"post": 3, "thread": 1, "article": 1},
    ),
    "researcher": collection(
        {"research": 60, "ai": 55, "engineering": 10, "other": 10}, {"paper": 3, "thread": 2, "article": 2, "post": 2}
    ),
}

EXPECTED_ARCHETYPE = {
    "developer": "builder",
    "founder": "idea-hunter",
    "specialist": "rabbit-hole",
    "diverse": "curator",
    "mixed": "explorer",
    "researcher": "researcher",
}


@pytest.mark.parametrize("name", list(DATASETS))
def test_archetype_follows_the_data(name):
    _, _, arch, _ = report(DATASETS[name])
    assert arch["primary"] == EXPECTED_ARCHETYPE[name], arch["signals"]


@pytest.mark.parametrize("name", list(DATASETS))
def test_score_is_bounded_deterministic_and_explained(name):
    a = report(DATASETS[name])[1]
    b = report(DATASETS[name])[1]
    assert a == b
    assert 0 <= a["total"] <= 100 and a["total"] == sum(d["value"] for d in a["dimensions"])
    assert all(0 <= d["value"] <= 25 and d["explanation"] for d in a["dimensions"])
    assert a["version"] == "score-v2"


def test_score_golden_values_detect_unversioned_changes():
    # If these move, the formula changed: bump SCORE_VERSION and update docs/scoring-rules.md.
    assert report(DATASETS["diverse"])[1]["total"] == 94
    assert report(DATASETS["specialist"])[1]["total"] == 59


def test_empty_collection():
    stats, score, arch, ach = report([])
    assert stats["accessible"] == 0 and score["total"] == 0
    assert arch["primary"] == "collector"
    assert not any(a["earned"] for a in ach.values())


def test_small_collection_is_neutral_and_not_inflated():
    items = collection(
        {"ai": 1, "design": 1, "startups": 1, "research": 1, "security": 1},
        {"repo": 1, "paper": 1, "thread": 1, "video": 1, "tool": 1},
    )
    stats, score, arch, ach = report(items)
    assert arch["primary"] == "collector"  # too little evidence to label anyone
    dims = {d["id"]: d["value"] for d in score["dimensions"]}
    assert dims["exploration"] <= 5 and dims["diversity"] <= 5
    assert ach["first-scan"]["earned"] and not ach["bookmark-rookie"]["earned"]


def test_size_alone_does_not_raise_the_score():
    base = {"ai": 10, "engineering": 10, "design": 10, "startups": 10}
    small = report(collection(base, {"post": 1, "thread": 1}))[1]["total"]
    big = report(collection({k: v * 10 for k, v in base.items()}, {"post": 1, "thread": 1}))[1]["total"]
    assert big == small


def test_missing_metadata_is_not_penalised_as_inaccessible():
    items = collection({"ai": 40}) + [StatItem("ai", "post", "x", "x", None, accessible=False) for _ in range(40)]
    stats, score, *_ = report(items)
    assert stats["inaccessible"] == 40
    assert {d["id"]: d["value"] for d in score["dimensions"]}["coverage"] == 25


def test_achievement_thresholds():
    _, _, _, dev = report(DATASETS["developer"])
    assert dev["open-source-hunter"]["earned"]
    assert dev["deep-diver"]["earned"] and dev["deep-diver"]["current"] == 50
    assert not dev["digital-archivist"]["earned"] and dev["digital-archivist"]["current"] == 175
    _, _, _, div = report(DATASETS["diverse"])
    assert div["wide-explorer"]["earned"] and div["curiosity-engine"]["earned"]
    assert not report(DATASETS["founder"])[3]["open-source-hunter"]["earned"]


def test_provisional_flag_for_partial_scans():
    stats = compute_stats(DATASETS["developer"])
    assert derive_archetype(stats, provisional=True)["provisional"] is True


# ── classifier ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("text", "links", "topic", "ctype"),
    [
        ("Postgres tip: partial indexes cut latency", [], "engineering", "post"),
        ("This open-source CLI replaced my terminal setup", ["https://github.com/a/b"], "devtools", "repo"),
        ("Fresh results", ["https://arxiv.org/abs/2401.1"], "research", "paper"),
        ("Talk on serving LLM inference", ["https://youtube.com/watch?v=1"], "ai", "video"),
        ("Our SaaS pricing experiments", ["https://example.substack.com/p/x"], "startups", "article"),
        ("Me every Monday", [], "other", "post"),
        ("Check this", ["https://some-product.app"], "other", "tool"),
    ],
)
def test_classifier_topics_and_types(text, links, topic, ctype):
    c = classify(ClassifierInput(text, links))
    assert (c.topic, c.content_type) == (topic, ctype)


def test_classifier_marks_unclassified_and_uncertain():
    c = classify(ClassifierInput("lol", []))
    assert c.status == "unclassified" and c.confidence == 0
    c = classify(ClassifierInput("Check this", ["https://some-product.app"]))
    assert c.content_type_certain is False


def test_thread_heuristic_needs_root_and_marker():
    assert classify(ClassifierInput("A thread on pricing 🧵", [], is_conversation_root=True)).content_type == "thread"
    assert classify(ClassifierInput("A thread on pricing 🧵", [], is_conversation_root=False)).content_type == "post"
    assert classify(ClassifierInput("Long essay", [], is_long_form=True)).content_type == "article"


def test_secondary_tags_and_confidence():
    c = classify(ClassifierInput("Design a SaaS pricing page with good typography for founders", []))
    assert c.topic in {"startups", "design"}
    assert c.secondary and all(0 < conf <= 1 for _, conf in c.secondary)
    assert 0 < c.confidence <= 1


def test_short_keywords_match_whole_words_only():
    assert classify(ClassifierInput("build the thing", [])).topic == "other"  # "ui" inside "build"
