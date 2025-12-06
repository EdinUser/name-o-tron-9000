import json
from pathlib import Path


def load_release():
    release_path = Path(__file__).parent / "release.json"
    if release_path.exists():
        try:
            return json.loads(release_path.read_text())
        except json.JSONDecodeError:
            return {}
    return {}


def define_env(env):
    env.variables["release"] = load_release()

