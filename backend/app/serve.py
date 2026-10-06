import uvicorn

# The API serves one local user, so it binds to loopback only (ADR-0001).
API_HOST = "127.0.0.1"
API_PORT = 8000


def run() -> None:
    uvicorn.run("app.main:app", host=API_HOST, port=API_PORT)


if __name__ == "__main__":
    run()
