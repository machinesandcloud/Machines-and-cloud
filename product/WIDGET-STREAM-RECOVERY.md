# Customer chat stream recovery

The installed customer widget now requires an explicit valid completion packet before saving an assistant reply in browser history. Partial text followed by a dropped or malformed response is replaced with an interruption message. It does not automatically resend a request, because the server may already have saved it.

A complete final record without a trailing newline is accepted. A valid completion releases the composer without waiting for the connection to close; fetch and body reads share a 90-second deadline. Closing the widget during a reply does not reopen it or take focus.

Local acceptance: 25 focused stream fixtures and 16 independent browser/storage/payload groups passed on embed SHA256 `e96a5190e806a79e2572aa9ebbe7b42743921d4c66ed56006cc578f404c64ae7`. Tests used controlled browser responses, zero external requests and no model/provider calls. Synthetic saved-request fixture records do not establish a real saved request or delivered service. The independent timeout test manually triggered the registered deadline callback.

[Independent receipt](../scratchpad/widget-stream-independent.json). [Engineering receipt](../scratchpad/website-stream-fixed.json). Original failure receipts are retained beside these. Publication and hosted acceptance are recorded separately in the launch release result.
