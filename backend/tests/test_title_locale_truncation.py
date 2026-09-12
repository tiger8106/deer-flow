"""The displayed title must still match the selected locale after truncation."""

from types import SimpleNamespace

import pytest

from deerflow.agents.middlewares.title_middleware import TitleMiddleware
from deerflow.config.title_config import TitleConfig


@pytest.mark.parametrize("locale,text", [("zh-CN", "Quarterly_Energy_Management_Report_" * 3 + "制作演示文稿"), ("en-US", "1234567890" * 8 + " report")])
def test_truncation_cannot_remove_the_only_locale_characters(locale, text):
    middleware = TitleMiddleware(app_config=SimpleNamespace(title=TitleConfig(max_chars=20)))
    language = middleware._normalize_title_language(locale)
    assert middleware._parse_title(text, locale) == ""
    fallback = middleware._fallback_title(text, locale)
    assert middleware._title_matches_language(fallback, language)
    assert len(fallback) <= 20
