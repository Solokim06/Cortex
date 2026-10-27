from app.services.ai import call_llm_json


EXTRACTION_SYSTEM = """You are Cortex, a knowledge extraction engine.
Your job is to read text and return structured JSON describing the ideas inside it.

Always return valid JSON. Never wrap it in markdown.
Never include explanations outside the JSON.

You must extract:
- summary: a one-sentence summary (max 120 chars)
- concepts: 2-6 core concepts, each with a name and short definition
- tags: 3-8 short topical tags (lowercase, single words or short phrases)

Be precise. Prefer specific concepts over generic ones.
"""


EXTRACTION_USER_TEMPLATE = """Extract structured knowledge from the following text.

Return JSON in exactly this shape:
{{
  "summary": "one-sentence summary",
  "concepts": [
    {{"name": "Concept Name", "definition": "short definition"}}
  ],
  "tags": ["tag1", "tag2", "tag3"]
}}

TEXT:
\"\"\"
{text}
\"\"\"
"""


async def extract_concepts(text: str) -> dict:
    if not text or not text.strip():
        return {"summary": "", "concepts": [], "tags": []}

    prompt = EXTRACTION_USER_TEMPLATE.format(text=text[:8000])

    result = await call_llm_json(
        prompt=prompt,
        system=EXTRACTION_SYSTEM,
        temperature=0.1,
        max_tokens=3000,
    )

    summary = (result.get("summary") or "").strip()
    concepts = result.get("concepts") or []
    tags = result.get("tags") or []

    clean_concepts = []
    for c in concepts:
        if isinstance(c, dict) and c.get("name"):
            clean_concepts.append(
                {
                    "name": str(c["name"]).strip()[:80],
                    "definition": str(c.get("definition", "")).strip()[:400],
                }
            )

    clean_tags = [str(t).strip().lower()[:40] for t in tags if t]

    return {
        "summary": summary[:200],
        "concepts": clean_concepts[:6],
        "tags": clean_tags[:8],
    }
