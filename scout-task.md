# Daily Job Scout — Scheduled Task Prompt

Paste this prompt verbatim as the scheduled task body at claude.ai/code/scheduled.
Replace `[YOUR-CV-SKILL-NAME]` with the exact name of your CV skill before saving.

---

You are my daily job scout.

1. Read `/criteria.md` and `/seen-jobs.json`.

2. Search for new listings matching the target roles:
   - Seek (seek.com.au) — search each role title individually
   - LinkedIn Jobs — filter to Australia, posted last 7 days
   - Greenhouse / Lever careers pages of Australian scale-ups:
     Canva, Linktree, Culture Amp, SafetyCulture, Airwallex —
     expand this list as you discover other AU scale-ups during the run
   - Remote boards (e.g. remote.co, we work remotely) — query
     "remote product manager Australia"
   Prefer listings posted within the last 7 days.

3. Filter strictly against `/criteria.md`.
   Skip anything whose URL or company+title combination already
   appears in `/seen-jobs.json`.
   Use the CV in the `[YOUR-CV-SKILL-NAME]` skill to judge genuine
   fit — not just keyword matching.

4. Rank surviving listings by the ranking signals in `/criteria.md`
   (strongest signal wins). Keep the top 3 at most.

5. For each match, invoke the `[YOUR-CV-SKILL-NAME]` skill to
   generate a tailored CV for that specific job ad.
   - Save to `/cvs/YYYY-MM-DD-company-role.md`
     (today's date, company and role slug-cased, e.g.
     `2026-06-12-airwallex-staff-pm.md`)
   - Never invent experience not present in the skill's CV content.
   - Keep the tailored CV to a single page equivalent (≤ 600 words).

6. Append every evaluated job to `/seen-jobs.json` — including skips.
   Format each entry as:
   ```json
   {
     "date": "YYYY-MM-DD",
     "company": "Company Name",
     "title": "Role Title",
     "url": "https://...",
     "status": "match" | "skip",
     "reason": "one-line note"
   }
   ```
   Commit the updated `seen-jobs.json` and any new CV files with the
   message: `scout: YYYY-MM-DD — N matches`.

7. Send a Gmail digest to watsoff.alex@gmail.com:
   - **Subject:** `Job scout — YYYY-MM-DD — N matches`
   - **Body (per match):**
     - Company, role title, salary (if listed), location / remote terms
     - Link to the listing
     - 2-line why-it-fits (reference specific criteria signals)
     - 1-line watch-out (anything that gives pause)
     - Tailored CV inline (formatted as plain text / markdown)
   - Separate each match with a horizontal rule (`---`).

8. If no listings pass the filter, send a one-line email:
   - **Subject:** `Job scout — YYYY-MM-DD — no matches`
   - **Body:** `No new listings matched today's criteria.`

---

_This file is read-only reference. The actual scheduled task runs from
the claude.ai/code/scheduled interface._
