# Launch log

The audit trail for taking the project public (`docs/LAUNCH_PLAN.md` §0.1.4). One entry per working session: date, phase, what changed, what was verified, what is still open.

## §1 answers from SS

Asked on 2026-09-26. Locked on 2026-09-30.

| # | Question | Answer |
|---|---|---|
| 1 | Publisher name | **Pakistan Government Graph** (project name for attribution / CC BY) |
| 2 | Corrections contact | **GitHub Issues** using the Correction-request template (§3.3), until a dedicated project email exists |
| 3 | Custom domain | GitHub Pages default address for now |
| 4 | Legal cases at launch | **(a) Hide** from the public build / exports until after Pakistani lawyer review (§4.4) |
| 5 | Declared assets at launch | Keep, sourced to ECP publications only |
| 6 | Family ties (`relative_of`) | Include, with a family **tree / map** view (§6 and §7.15) |
| 7 | Urdu interface | Names in Urdu and English only; no full Urdu interface (skip §7.9) |

Also recorded: landing-page analytics and infographics (§7.14).

---

## 2026-09-30 · §1 answers locked

Branch `launch/section-1-locked`, from `main` at `2ef5f66`.

### What changed

- Locked the three remaining §1 decisions (publisher, corrections contact, legal cases) per SS approval.
- Confirmed the four answers already on `main`'s LAUNCH_PLAN §1 table (GitHub Pages domain; declared assets ECP-only; family ties include + tree/map; Urdu names only).
- Created this `docs/LAUNCH_LOG.md` on mainline with the locked table (Phase 0's log still lives only on `launch/phase-0-baseline`). Canonical §1 record is this log (§1 of the plan says to record answers here).
- `docs/LAUNCH_PLAN.md` §1 answers table on `main` still shows Pending for items 1, 2 and 4; sync that mirror table in a follow-up if desired.

### Verified

- Doc-only change; no code or data gates required.

### Open

- Optionally sync LAUNCH_PLAN §1 answers table (items 1, 2, 4) to match this log.
- Create the dedicated project corrections email when ready, then update this table, About, and `SECURITY.md`.
- Phase 2 policy can proceed with these answers (§4 hard stop cleared for §1).
- Phase 0 baseline PR (#3) still open separately.
- Branch `launch/section-1-answers` was abandoned after a bad partial write to LAUNCH_PLAN; prefer this branch / delete the abandoned one.
