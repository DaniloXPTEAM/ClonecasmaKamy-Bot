import json
import os
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "automation" / "dist" / "server.js"


def _port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _request(url, method="GET", payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(
        url, data=data, method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode())


def test_local_automation_engine_workflow_catalog_and_persistence(tmp_path):
    if not shutil.which("node"):
        return
    port = _port()
    env = os.environ.copy()
    env.update({
        "KAMY_AUTOMATION_PORT": str(port),
        "KAMY_AUTOMATION_HOST": "127.0.0.1",
        "KAMY_AUTOMATION_DATA_DIR": str(tmp_path / "automation"),
        "KAMY_MASTER_KEY": "test-only-local-automation-key",
    })
    process = subprocess.Popen(
        ["node", str(ENGINE)], cwd=ROOT, env=env,
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        deadline = time.time() + 8
        while time.time() < deadline:
            if process.poll() is not None:
                raise AssertionError(process.stderr.read().decode())
            try:
                status, health = _request(base + "/health")
                if status == 200 and health["service"] == "kamy-automation":
                    break
            except (OSError, urllib.error.URLError):
                time.sleep(0.1)
        else:
            raise AssertionError("Automation Engine did not become healthy")

        status, catalog = _request(base + "/api/automation/integrations")
        assert status == 200
        assert len(catalog["items"]) >= 30
        assert catalog["liveAdapters"] == 1

        nodes = [
            {"id": "trigger", "type": "manual", "name": "Start", "x": 40, "y": 40, "config": {}},
            {"id": "map", "type": "transform", "name": "Map", "x": 300, "y": 40,
             "config": {"value": {"greeting": "Olá {{input.name}}"}}},
            {"id": "log", "type": "log", "name": "Log", "x": 560, "y": 40, "config": {}},
        ]
        flow = {
            "name": "Workflow de teste",
            "active": False,
            "allowCodeExecution": False,
            "nodes": nodes,
            "edges": [
                {"id": "e1", "source": "trigger", "target": "map"},
                {"id": "e2", "source": "map", "target": "log"},
            ],
        }
        status, saved = _request(base + "/api/automation/workflows", "POST", flow)
        assert status == 201
        workflow_id = saved["id"]

        status, run = _request(
            base + f"/api/automation/workflows/{workflow_id}/run",
            "POST", {"input": {"name": "Kamy"}},
        )
        assert status == 200
        assert run["status"] == "success"
        assert len(run["nodeRuns"]) == 3
        assert run["nodeRuns"][1]["output"]["greeting"] == "Olá Kamy"

        status, runs = _request(base + f"/api/automation/workflows/{workflow_id}/runs")
        assert status == 200 and len(runs["items"]) == 1

        cyclic = dict(flow)
        cyclic["name"] = "Workflow cíclico"
        cyclic["edges"] = flow["edges"] + [{"id": "e3", "source": "log", "target": "trigger"}]
        status, error = _request(base + "/api/automation/workflows", "POST", cyclic)
        assert status == 400 and "ciclo" in error["detail"].lower()

        code_flow = dict(flow)
        code_flow["name"] = "Code blocked"
        code_flow["nodes"] = [nodes[0], {
            "id": "code", "type": "javascript", "name": "Code",
            "x": 300, "y": 40, "config": {"code": "return input;"},
        }]
        code_flow["edges"] = [{"id": "ec", "source": "trigger", "target": "code"}]
        status, error = _request(base + "/api/automation/workflows", "POST", code_flow)
        assert status == 400 and "código local" in error["detail"]

        secret = "automation-test-secret-never-store-plain"
        status, saved_ai = _request(
            base + "/api/automation/settings/ai", "PUT",
            {"ai": {"baseUrl": "https://api.example.com/v1", "model": "test-model", "apiKey": secret}},
        )
        assert status == 200 and saved_ai["settings"]["configured"] is True
        persisted_settings = (tmp_path / "automation" / "settings.json").read_text()
        assert secret not in persisted_settings
        assert "apiKey" in persisted_settings
    finally:
        process.terminate()
        try:
            process.wait(timeout=4)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)
