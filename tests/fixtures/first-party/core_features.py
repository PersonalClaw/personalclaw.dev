"""A fixture core_features.py: two feature names, the shape core v0.2.4's file has."""

from __future__ import annotations

GUARDED_CLIENTS = "guarded-clients"

CHAT_TRUST = "chat-trust"

CORE_FEATURES: frozenset[str] = frozenset(
    {
        CHAT_TRUST,
        GUARDED_CLIENTS,
    }
)
