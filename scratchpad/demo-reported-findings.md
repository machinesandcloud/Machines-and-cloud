# Reported plumber/Spanish demo: independent public reproduction

October 21, 2026. [Raw observations](demo-reported.json) preserve one fresh 1440×1000 desktop context and one fresh 390×844 phone context, both with normal motion. Each of the five CSS/JS assets was fetched once, matched local source, and was reused. No API request, form submission, non-GET request or JavaScript error occurred. No further public requests are needed for this diagnosis.

## Returned behavior

1. **Selecting a scenario does not run it.** On both desktop and phone, clicking the plumber or Spanish scenario leaves `1 of 4 messages` and Play after 8.5 seconds. Pressing Play completes all four messages. Switching scenarios during playback again resets to a paused first message. The click handler sets `autoStarted = true` and renders the reset state without starting playback. A visitor's apparent attempt to try another example therefore requires a second, separate action.
2. **The useful phone response is below the screen.** With the section framed under the fixed header at 390×844, the Spanish first assistant response spans y816–941 and the final response y908–1053. The page remains at the same scroll position. The internal count reaches four even though the visitor cannot see the final response in that framing. The owner-summary view requires roughly 1,253 additional pixels of page scrolling. Correct DOM contents do not establish a legible customer-to-owner demonstration.
3. **The plumber “call” is a silent transcript.** The tab says “A call for a plumber”; the selected header says “Call transcript.” There is no audio/video element or audio control in the component. Explicit Play animates text. This diagnosis makes no claim about an actual voice conversation or AI request, since neither occurred.

Review images: [desktop plumber first click](demo-reported-desktop-plumber-firstclick.png), [phone plumber first click](demo-reported-phone-plumber-firstclick.png), [desktop Spanish after Play](demo-reported-desktop-spanish-played.png), [phone Spanish after Play](demo-reported-phone-spanish-played.png).

## Acceptance direction pending final PO brief

The next acceptance should follow what a visitor and shop owner can accomplish:

- A scenario choice produces the chosen, legible example with an obvious running/paused/completed state; the visitor does not have to discover a second unrelated action after an apparently successful first click.
- On a phone, the current reply can be read and the owner result can be reached through an obvious adjacent control. Neither a progress counter nor hidden message nodes substitute for visible completion.
- A voice promise produces audible interaction after explicit consent, or the entry point clearly promises a readable transcript instead. Voice lifecycle controls and microphone handling require independent local fixtures before any authorized real call.
- Ordinary after-hours inquiries produce tentative requests with a next owner action; callback-only customers do not get forced into visit intake; Spanish corrections update the owner's actual facts; price/area/time boundaries refuse or offer an honest alternative; emergencies deliver safety instructions first and a human-handoff request.
- Practice replies and owner summaries agree about intent, timing, contact details and uncertainty. No real booking, sent message or completed callback is claimed from practice state.

These are proposed customer outcomes awaiting PO's final research and delivery scope. They are not claims that current code or a future voice connection satisfies them.
