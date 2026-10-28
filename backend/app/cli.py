"""Small operator commands. Usage: uv run python -m app.cli <command>"""

import secrets
import sys

from .security import generate_key


def gen_secrets() -> None:
    print("# Paste into backend/.env (never commit this file)")
    print(f"SESSION_SECRET={secrets.token_urlsafe(48)}")
    print(f"TOKEN_ENCRYPTION_KEY={generate_key()}")


if __name__ == "__main__":
    commands = {"gen-secrets": gen_secrets}
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        print(f"usage: python -m app.cli [{'|'.join(commands)}]")
        sys.exit(1)
    commands[sys.argv[1]]()
