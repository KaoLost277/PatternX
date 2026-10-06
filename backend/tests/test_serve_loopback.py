import ipaddress

from app import serve


def test_serve_run_binds_the_api_to_loopback_only(monkeypatch):
    captured_run_arguments = {}

    def capture_uvicorn_run(application_path, host, port):
        captured_run_arguments["host"] = host
        captured_run_arguments["port"] = port

    monkeypatch.setattr(serve.uvicorn, "run", capture_uvicorn_run)

    serve.run()

    assert ipaddress.ip_address(captured_run_arguments["host"]).is_loopback
