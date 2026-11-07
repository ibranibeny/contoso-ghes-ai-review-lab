"""Contoso engineering standards as an MCP server (streamable HTTP on :8080/mcp).

The AI reviewer calls these tools to ground its comments in Contoso's own rules
(secure coding guide, API guidelines, architecture decision records) instead of
generic advice. Read-only, no credentials, content versioned in Git.
"""
import os
import re
from pathlib import Path

from mcp.server.fastmcp import FastMCP

try:  # mcp >= 1.10: reject requests whose Host header is not ours (DNS-rebinding protection)
    from mcp.server.transport_security import TransportSecuritySettings

    hosts = [h.strip() for h in os.environ.get("ALLOWED_HOSTS", "localhost").split(",") if h.strip()]
    security = TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=[f"{h}:*" for h in hosts] + hosts,
        allowed_origins=[],
    )
except ImportError:  # older SDK
    security = None

kwargs = dict(host="0.0.0.0", port=8080, stateless_http=True, json_response=True)
if security is not None:
    kwargs["transport_security"] = security
mcp = FastMCP("contoso-standards", **kwargs)

DOCS = Path(__file__).parent / "standards"


def _load():
    """Parse every standards file into rules: '### <RULE-ID> <title>' headings."""
    docs, rules = {}, []
    for f in sorted(DOCS.glob("*.md")):
        text = f.read_text(encoding="utf-8")
        title = text.splitlines()[0].lstrip("# ").strip()
        doc_id = f.stem.upper()
        docs[doc_id] = {"id": doc_id, "title": title, "text": text}
        for m in re.finditer(r"^### (\S+) (.+?)\n(.*?)(?=^### |\Z)", text, re.S | re.M):
            rules.append({"rule_id": m.group(1), "title": m.group(2).strip(),
                          "text": m.group(3).strip(), "source": title})
    return docs, rules


DOCS_BY_ID, RULES = _load()


@mcp.tool()
def list_standards() -> list[dict]:
    """List Contoso's engineering standards documents (id and title)."""
    return [{"id": d["id"], "title": d["title"]} for d in DOCS_BY_ID.values()]


@mcp.tool()
def search_guidelines(query: str, top: int = 5) -> list[dict]:
    """Search Contoso's coding rules (secure coding, API guidelines, ADRs).

    Returns the best matching rules with their rule_id, which reviewers must cite.
    Use plain words, for example "sql injection", "money float rounding", "http timeout".
    """
    words = [w for w in re.findall(r"[a-z0-9]+", query.lower()) if len(w) > 2]
    scored = []
    for r in RULES:
        hay = f"{r['rule_id']} {r['title']} {r['text']}".lower()
        score = sum(hay.count(w) for w in words) + sum(3 for w in words if w in r["title"].lower())
        if score:
            scored.append((score, r))
    scored.sort(key=lambda x: -x[0])
    return [r for _, r in scored[: max(1, min(top, 10))]]


@mcp.tool()
def get_standard(doc_id: str) -> str:
    """Return the full text of one standards document, e.g. 'ADR-0007-MONEY' or 'SECURE-CODING'."""
    key = doc_id.strip().upper()
    for k, d in DOCS_BY_ID.items():
        if k == key or k.startswith(key):
            return d["text"]
    return f"No standard named {doc_id}. Known: {', '.join(DOCS_BY_ID)}"


@mcp.tool()
def get_review_checklist(language: str = "python") -> str:
    """Return the pull request review checklist for a language (currently python)."""
    d = DOCS_BY_ID.get(f"CHECKLIST-{language.strip().upper()}")
    return d["text"] if d else "No checklist for that language; use search_guidelines."


try:
    from starlette.requests import Request
    from starlette.responses import JSONResponse

    @mcp.custom_route("/healthz", methods=["GET"])
    async def healthz(_: Request) -> JSONResponse:
        return JSONResponse({"status": "ok", "rules": len(RULES), "documents": len(DOCS_BY_ID)})
except AttributeError:  # custom_route needs a newer SDK; health check is optional
    pass


if __name__ == "__main__":
    print(f"contoso-standards: {len(DOCS_BY_ID)} documents, {len(RULES)} rules", flush=True)
    mcp.run(transport="streamable-http")
