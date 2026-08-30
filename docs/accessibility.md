# Accessibility acceptance

Automated gates cover semantic landmarks and headings, labelled controls, keyboard-operable native inputs/buttons, one polite live region, deterministic focus transfer between demo/auth/workspace/sign-out surfaces, Axe serious/critical violations, 320 CSS-pixel reflow including the one-time guest credential, reduced-motion CSS, forced-colors emulation, pending/conflict/retry/discard/revoked states, and Chromium/Firefox parity where installed.

They do not prove physical assistive-technology acceptance. Run these scripts before a user-facing deployment.

## NVDA on Windows

1. Start NVDA with Firefox or Chromium and open the exact built application.
2. Use landmarks/headings navigation to reach Today, Chores, Groceries, Pixel, Home Assistant handoff, and Guest access.
3. Tab from the skip link through Reset Demo and every chore checkbox. Confirm visible focus and meaningful names/state.
4. Complete and reset a chore. Confirm one concise announcement per action, with no duplicated speech.
5. At 200% and 400% browser zoom, confirm content reflows without horizontal page scrolling and every control remains reachable.
6. Enable Windows High Contrast. Confirm selected/completed/pending/conflict/blocked states remain distinguishable without color alone.
7. In an authenticated test realm, exercise validation, server error, offline Pending, conflict, guest expired, guest revoked, and forbidden states. Confirm input is preserved and recovery is named.

## iPhone VoiceOver

1. Install/open the PWA in Safari on an iPhone and enable VoiceOver.
2. Swipe by headings and controls; confirm reading order follows visual order and touch targets are comfortable.
3. Complete/reset demo chores and confirm state and announcement.
4. Enable airplane mode after the first load, reopen, and confirm the demo remains labelled and usable.
5. Return online and exercise an authenticated disposable test realm. Confirm Pending changes sync once and conflicts require an explicit decision.
6. Increase Text Size and Display Zoom; confirm no clipped labels, hidden controls, or motion-dependent meaning.

Record browser/OS/AT versions and failures. Do not claim physical acceptance from the automated suite alone.
