# COSMOS — visual landing page study

A standalone static-site recreation based on the supplied 36-second reference clip. It uses locally stored generated artwork, CSS and JavaScript; it has no package dependencies.

See REFERENCE-ANALYSIS.md for the visual and interaction breakdown that guided the build.

## Run locally

Install Node.js 18 or newer, then run from this folder:

    node server.mjs

Open http://127.0.0.1:4174.

## Included interactions

- Scroll-based hero transition, reveal animation, and progress indicator
- Floating image cards with save-state feedback
- Dark/light theme toggle (saved in this browser)
- Waitlist form presentation and sign-in dialog
- Responsive layout and reduced-motion support

The waitlist and sign-in are front-end demonstrations only. No email is sent and no account system is connected.
