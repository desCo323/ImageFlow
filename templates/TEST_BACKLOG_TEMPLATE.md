# <AppName> Test and UX Backlog

## Execution rules

- Live write tests only with backup.
- Only approved test user.
- Isolated test folders.
- Debug logging during test window.
- Reset after every test block.
- Record results in `docs/SESSION_STATE.md`.

## Preflight

| ID | Check | Expected | Status |
| --- | --- | --- | --- |
| PRE-01 | Syntax | PHP/JS valid | Ready |
| PRE-02 | Self-check | all checks pass | Ready |
| PRE-03 | Browser smoke | no overflow/contrast issue | Ready |
| PRE-04 | Secret scan | no secrets | Ready |

## Functional tests

| ID | Scenario | Expected | Priority |
| --- | --- | --- | --- |
| FUN-01 | First run | expected objects created | P0 |
| FUN-02 | Update | changes reflected | P0 |
| FUN-03 | Delete/reset | only app-managed data removed | P0 |

## Security tests

| ID | Scenario | Expected | Priority |
| --- | --- | --- | --- |
| SEC-01 | CSRF | protected | P0 |
| SEC-02 | Admin route as user | rejected | P0 |
| SEC-03 | Path traversal | rejected | P0 |
| SEC-04 | Stale fingerprint | blocked | P0 |

## UX tests

| ID | Scenario | Expected | Priority |
| --- | --- | --- | --- |
| UX-01 | First open | clear next action | P0 |
| UX-02 | Mobile | no overflow | P1 |
| UX-03 | Accessibility | keyboard/focus/readable | P1 |
