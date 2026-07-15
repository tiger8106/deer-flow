from types import SimpleNamespace

from langchain.agents.middleware import AgentMiddleware

from deerflow.agents.lead_agent.agent import load_extension_middlewares
from deerflow.config.extensions_config import ExtensionsConfig


class ExampleExtensionMiddleware(AgentMiddleware):
    pass


def test_extensions_config_accepts_middleware_class_paths():
    config = ExtensionsConfig.model_validate({"middlewares": ["test_extension_middlewares:ExampleExtensionMiddleware"]})

    assert config.middlewares == ["test_extension_middlewares:ExampleExtensionMiddleware"]


def test_load_extension_middlewares_resolves_instances(monkeypatch):
    monkeypatch.delenv("DEER_FLOW_AGENT_MIDDLEWARES", raising=False)
    app_config = SimpleNamespace(extensions=SimpleNamespace(middlewares=["test_extension_middlewares:ExampleExtensionMiddleware"]))

    result = load_extension_middlewares(app_config)

    assert len(result) == 1
    assert isinstance(result[0], ExampleExtensionMiddleware)


def test_load_extension_middlewares_accepts_environment_paths(monkeypatch):
    monkeypatch.setenv(
        "DEER_FLOW_AGENT_MIDDLEWARES",
        "test_extension_middlewares:ExampleExtensionMiddleware",
    )
    app_config = SimpleNamespace(extensions=SimpleNamespace(middlewares=[]))

    result = load_extension_middlewares(app_config)

    assert len(result) == 1
    assert isinstance(result[0], ExampleExtensionMiddleware)
