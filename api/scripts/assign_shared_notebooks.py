"""Hand the access codes' shared notebooks to one account (spec 0014, AC-9), when the codes
retire. Run it against the production database, then remove ACCESS_CODES:

    uv run python scripts/assign_shared_notebooks.py --email ana@example.com --dry-run
    uv run python scripts/assign_shared_notebooks.py --email ana@example.com
"""

import argparse
import sys
from pathlib import Path
from uuid import UUID

API_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(API_DIR))

from sqlmodel import Session  # noqa: E402

from app.core.db import get_engine  # noqa: E402
from app.repositories.space import account_by_email, assign_shared  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Hand the shared notebooks to one account (spec 0014, AC-9)."
    )
    who = parser.add_mutually_exclusive_group(required=True)
    who.add_argument("--email", help="the account's email, looked up in Supabase")
    who.add_argument("--user-id", type=UUID, help="the account's Supabase user id")
    parser.add_argument("--dry-run", action="store_true", help="only count the notebooks")
    args = parser.parse_args()
    with Session(get_engine()) as session:
        owner: UUID | None = args.user_id or account_by_email(session, args.email)
        if owner is None:
            print(f"No account with the email {args.email}; it must sign in once first.")
            return 1
        count = assign_shared(session, owner, dry_run=args.dry_run)
    verb = "would move" if args.dry_run else "moved"
    print(f"{verb} {count} shared notebooks to {owner}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
