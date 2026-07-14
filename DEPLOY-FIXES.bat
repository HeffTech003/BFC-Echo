@echo off
cd /d "C:\Users\kaleb\UserskalebBFC-Echo"
echo === BFC Deploy Script ===

REM Remove stale git lock if present
if exist ".git\index.lock" (
    del /f ".git\index.lock"
    echo Removed stale index.lock
)

REM Clear bad staged state
git restore --staged .
echo Staging cleared

REM Stage only the code changes
git add command-centre\src\proxy.ts
git add command-centre\src\components\app-shell.tsx
git add command-centre\src\app\layout.tsx
git add command-centre\src\app\login\page.tsx
git add command-centre\src\app\dashboard\page.tsx
git add command-centre\src\app\financial\page.tsx
git add command-centre\src\app\payments\page.tsx
git add command-centre\src\app\subscriptions\page.tsx
git add "command-centre\src\app\members\[id]\page.tsx"
git add command-centre\src\app\members\page.tsx
git add command-centre\src\app\actions-queue\page.tsx
git add command-centre\src\app\audit\page.tsx
git add command-centre\src\app\cancellations\page.tsx
git add command-centre\src\app\compliance\page.tsx
git add command-centre\src\app\compliance\forms\page.tsx
git add command-centre\src\app\compliance\incidents\page.tsx
git add command-centre\src\app\compliance\policies\page.tsx
git add command-centre\src\app\email-review\page.tsx
git add command-centre\src\app\expenses\page.tsx
git add command-centre\src\app\invoices\page.tsx
git add command-centre\src\app\leads\page.tsx
git add command-centre\src\app\match-queue\page.tsx
git add command-centre\src\app\retention\page.tsx
git add command-centre\src\app\sync\page.tsx
git add command-centre\src\app\tasks\page.tsx
git add command-centre\src\app\trial-funnel\page.tsx
git add "command-centre\src\app\forms\[token]\page.tsx"
git add command-centre\supabase\sql\pending_fixes.sql
git add backfill-clubworx-dates.sql
git add BFC-PLATFORM-VISION.md

echo.
echo === Files staged: ===
git diff --cached --name-only

REM Commit
git commit -m "fix: bug triage — rename, portal auth, financial queries, subscriptions table

- Rename Command Centre to Bendigo Fight Centre across all locations
- proxy.ts: exempt /portal routes from admin auth (fixes redirect loop #32)
- financial/page.tsx: include AUTHORISED bills in expenses — was showing $0 (#37)
- payments/page.tsx: query xero_invoices for Xero revenue (#38)
- subscriptions/page.tsx: query memberships table not gocardless_mandates (#36)
- Add backfill SQL for joined_at corruption (#34)
- Add bulk member creation SQL for 100 unmatched records (#35)"

REM Push
git push origin main

echo.
echo === Done — Vercel will auto-deploy in ~2 minutes ===
timeout /t 60
