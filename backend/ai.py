import json
import re
import threading
import time
from typing import Optional

from flask import jsonify

from db import get_setting
from monarch_pipeline import auth

_ai_cooldowns = {}  # type: dict[str, float]
_AI_COOLDOWN_SECONDS = 2.0

_ai_cooldowns_lock = threading.Lock()


def _check_ai_rate_limit(endpoint: str):
    now = time.monotonic()
    with _ai_cooldowns_lock:
        last = _ai_cooldowns.get(endpoint, 0.0)
        if last > 0 and (now - last) < _AI_COOLDOWN_SECONDS:
            return jsonify({"error": "Please wait before retrying."}), 429
        _ai_cooldowns[endpoint] = now
    return None


def _sanitize_prompt_field(value, max_length=500):
    """Strip control chars (keep \\n, \\t) and truncate."""
    if not isinstance(value, str):
        return str(value)[:max_length]
    cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', value)
    return cleaned[:max_length]


def _get_ai_key(conn) -> Optional[str]:
    """Load AI API key: keychain first, then settings table fallback."""
    key = auth.load_ai_key()
    if key:
        return key
    return get_setting(conn, "ai_api_key")


def _extract_json(text: str, valid_category_ids: set = None) -> dict:
    """Parse JSON from AI response, stripping markdown fences if present.
    Optionally validates category_ids in recommendations."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        # Strip ```json ... ``` fences
        lines = cleaned.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines)
    result = json.loads(cleaned)

    if valid_category_ids and "recommendations" in result:
        original_count = len(result["recommendations"])
        result["recommendations"] = [
            r for r in result["recommendations"]
            if r.get("category_id") in valid_category_ids
        ]
        discarded = original_count - len(result["recommendations"])
        if discarded:
            print(f"[budget-builder] Discarded {discarded} recommendations with invalid category IDs")

    return result


def _call_ai(prompt: str, conn, max_tokens: int = 1024):
    """Call the configured AI provider. Returns (text, stop_reason, provider) or raises."""
    api_key = _get_ai_key(conn)
    model = get_setting(conn, "ai_model")
    provider = get_setting(conn, "ai_provider")
    base_url = get_setting(conn, "ai_base_url", "")

    if not api_key or not model or not provider:
        return None, None, None

    if provider == "anthropic":
        import anthropic as anthropic_sdk
        client = anthropic_sdk.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text, response.stop_reason, provider

    elif provider == "openai_compatible":
        from openai import OpenAI
        kwargs: dict = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        client = OpenAI(**kwargs)
        response = client.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.choices[0].message.content, response.choices[0].finish_reason, provider

    else:
        raise ValueError(f"Unknown provider: {provider}")
