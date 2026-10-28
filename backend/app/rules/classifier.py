"""Deterministic bookmark classification (classifier-v2).

Changes from the frontend's classifier-v1 (used by demo mode):
- per-bookmark confidence and up to two secondary topics,
- a domain hint (e.g. arxiv.org → research) adds one point to its topic,
- content type records whether it was certain (link domain, long-form) or a heuristic.
Ties go to the earlier topic in TOPICS, which keeps output stable.
"""

import re
from dataclasses import dataclass, field
from urllib.parse import urlparse

from .topics import TOPICS

CLASSIFIER_VERSION = "classifier-v2"

MAX_SECONDARY = 2

_DOMAIN_TYPES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(^|\.)(github\.com|gitlab\.com|codeberg\.org)$"), "repo"),
    (re.compile(r"(^|\.)(arxiv\.org|openreview\.net|biorxiv\.org|nature\.com|acm\.org|ieee\.org)$"), "paper"),
    (re.compile(r"(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$"), "video"),
    (re.compile(r"(^|\.)(substack\.com|medium\.com|dev\.to|hashnode\.dev)$|^blog\."), "article"),
)

_DOMAIN_TOPIC_HINTS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(^|\.)(arxiv\.org|openreview\.net|biorxiv\.org|nature\.com)$"), "research"),
    (re.compile(r"(^|\.)(github\.com|gitlab\.com|codeberg\.org|npmjs\.com|pypi\.org)$"), "devtools"),
    (re.compile(r"(^|\.)(huggingface\.co)$"), "ai"),
    (re.compile(r"(^|\.)(figma\.com|dribbble\.com)$"), "design"),
)

_THREAD_MARKERS = re.compile(r"🧵|\bthread\b|(^|\s|\()1/\d*|\b1\)", re.IGNORECASE)


@dataclass(frozen=True)
class ClassifierInput:
    text: str
    links: list[str]
    is_conversation_root: bool = False
    is_long_form: bool = False


@dataclass
class Classification:
    topic: str
    confidence: float
    matched: list[str]
    secondary: list[tuple[str, float]] = field(default_factory=list)
    content_type: str = "post"
    content_type_certain: bool = True
    thread_hint: bool = False
    status: str = "classified"


def host_of(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").removeprefix("www.")
    except ValueError:
        return ""


def _matches(haystack: str, keyword: str) -> bool:
    if len(keyword) <= 3:
        return re.search(rf"\b{re.escape(keyword)}\b", haystack) is not None
    return keyword in haystack


def classify_content_type(item: ClassifierInput) -> tuple[str, bool, bool]:
    """Returns (content_type, certain, thread_hint)."""
    for link in item.links:
        host = host_of(link)
        for pattern, ctype in _DOMAIN_TYPES:
            if pattern.search(host) or (ctype == "article" and "/blog/" in link):
                return ctype, True, False
    thread_hint = item.is_conversation_root and bool(_THREAD_MARKERS.search(item.text))
    if thread_hint:
        return "thread", False, True
    if item.is_long_form:
        return "article", True, False
    if item.links:
        # An unrecognised external link: most often a product or resource page.
        return "tool", False, False
    return "post", True, False


def classify(item: ClassifierInput) -> Classification:
    haystack = f"{item.text} {' '.join(item.links)}".lower()
    hosts = [host_of(link) for link in item.links]
    scored: list[tuple[str, int, list[str]]] = []
    for topic in TOPICS:
        if topic.id == "other":
            continue
        matched = [k for k in topic.keywords if _matches(haystack, k)]
        hint = sum(
            1 for host in hosts for pattern, tid in _DOMAIN_TOPIC_HINTS if tid == topic.id and pattern.search(host)
        )
        points = len(matched) + min(hint, 1)
        if points:
            scored.append((topic.id, points, matched))

    ctype, certain, thread_hint = classify_content_type(item)
    if not scored:
        return Classification("other", 0.0, [], [], ctype, certain, thread_hint, "unclassified")

    # Stable sort: highest points first, ties keep TOPICS order.
    scored.sort(key=lambda s: -s[1])
    top_id, top_points, top_matched = scored[0]
    runner_up = scored[1][1] if len(scored) > 1 else 0
    # Confidence grows with evidence and with the margin over the runner-up.
    confidence = round(min(1.0, 0.35 + 0.15 * top_points) * (1.0 if top_points > runner_up else 0.6), 2)
    secondary = [
        (tid, round(min(1.0, 0.35 + 0.15 * pts) * 0.8, 2)) for tid, pts, _ in scored[1:] if pts * 2 >= top_points
    ][:MAX_SECONDARY]
    return Classification(top_id, confidence, top_matched, secondary, ctype, certain, thread_hint)
