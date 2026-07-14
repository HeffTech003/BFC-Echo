# BFC Deploy Script — run this from PowerShell in C:\Users\kaleb\UserskalebBFC-Echo
Set-Location "C:\Users\kaleb\UserskalebBFC-Echo"

# 1. Remove stale git lock if present
$lockFile = ".git\index.lock"
if (Test-Path $lockFile) {
    Remove-Item $lockFile -Force
    Write-Host "Removed stale index.lock" -ForegroundColor Yellow
}

# 2. Clear the bad staged state (there are staged deletions of important files)
git restore --staged .
Write-Host "Staging area cleared" -ForegroundColor Yellow

# 3. Stage only the code changes from this session
$filesToAdd = @(
    "command-centre\src\proxy.ts",
    "command-centre\src\components\app-shell.tsx",
    "command-centre\src\app\layout.tsx",
    "command-centre\src\app\login\page.tsx",
    "command-centre\src\app\dashboard\page.tsx",
    "command-centre\src\app\financial\page.tsx",
    "command-centre\src\app\payments\page.tsx",
    "command-centre\src\app\subscriptions\page.tsx",
    "command-centre\src\app\actions-queue\page.tsx",
    "command-centre\src\app\audit\page.tsx",
    "command-centre\src\app\cancellations\page.tsx",
    "command-centre\src\app\compliance\page.tsx",
    "command-centre\src\app\compliance\forms\page.tsx",
    "command-centre\src\app\compliance\incidents\page.tsx",
    "command-centre\src\app\compliance\policies\page.tsx",
    "command-centre\src\app\email-review\page.tsx",
    "command-centre\src\app\expenses\page.tsx",
    "command-centre\src\app\invoices\page.tsx",
    "command-centre\src\app\leads\page.tsx",
    "command-centre\src\app\match-queue\page.tsx",
    "command-centre\src\app\members\page.tsx",
    "command-centre\src\app\members\[id]\page.tsx",
    "command-centre\src\app\payments\page.tsx",
    "command-centre\src\app\retention\page.tsx",
    "command-centre\src\app\sync\page.tsx",
    "command-centre\src\app\tasks\page.tsx",
    "command-centre\src\app\trial-funnel\page.tsx",
    "command-centre\src\app\forms\[token]\page.tsx",
    "command-centre\supabase\sql\pending_fixes.sql",
    "backfill-clubworx-dates.sql",
    "BFC-PLATFORM-VISION.md"
)

foreach ($f in $filesToAdd) {
    if (Test-Path $f) {
        git add $f
        Write-Host "Staged: $f" -ForegroundColor Green
    } else {
        Write-Host "SKIP (not found): $f" -ForegroundColor Gray
    }
}

# 4. Show what's staged
Write-Host "`nStaged files:" -ForegroundColor Cyan
git diff --cached --name-only

# 5. Commit
git commit -m "fix: bug triage — rename, proxy portal auth, financial queries, subscriptions table

- Rename 'Command Centre' to 'Bendigo Fight Centre' across all 27 locations
- proxy.ts: exempt /portal routes from admin auth (fixes member portal redirect loop)
- financial/page.tsx: include AUTHORISED bills in P&L expenses (was showing \$0)
- payments/page.tsx: query xero_invoices for Xero revenue (not payment_events)
- subscriptions/page.tsx: query memberships table (not missing gocardless_mandates)
- Add backfill SQL for joined_at corruption (bug #34)
- Add bulk member creation SQL for 100 unmatched Clubworx records (bug #35)

Closes #1 #32 #33 #36 #37 #38 #39"

# 6. Push
git push origin main
Write-Host "`nDone — Vercel will auto-deploy in ~2 minutes" -ForegroundColor Green
