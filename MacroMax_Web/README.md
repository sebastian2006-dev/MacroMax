
index.html
index.html
HTML
script.js
script.js
JS
styles.css
styles.css
CSS
README.md
README.md
69 lines
MD
hey so as you might be knowing i built an app called macromax which tracks calories and protein intake of a person now 
i just made a promo video and website 
im providing you all the codes of it 
what i want you to do i  reshape the generic ai lop materials 
add a animated background keep a glassmorphic website style and make all the elements feel premium with animated hover animations and make the infinite sliding window of the  screenhot section ultra smooth 
if you need any more material for refrence please ask so 
also remove useless texts in the website that doesnt explain the funtionality of the app but rather explains what a particular section is doing in the website


Ran 12 commands, read 8 files, created 3 files · 10 notes







Ran 12 commands, read 8 files, created 3 files · 10 notes
I rebuilt all four files and dropped them in over your originals, so your assets/, video/ and downloads/ folders stay as they are.

I tested it in a headless browser with placeholder screenshots. The slider drifted, dragged with momentum and opened the lightbox, and the light theme and mobile layout rendered correctly. I haven't seen it with your real screenshots, video or fonts, so check the real thing.

Animated background. Slow-drifting emerald and cyan light fields sit behind the page, with large macro rings turning slowly and a small pointer parallax. It reduces to a static background if the visitor has reduced-motion turned on.

Glass and hover motion.

Cards have a light that follows the cursor across their surface and edge.
Buttons get a light sweep on hover, and the nav has a sliding pill that tracks the section you're in.
Icons, tabs and chips have small hover animations.
The hero phone tilts with your mouse.
Slider. I replaced the scroll-position trick (it had a visible snap when wrapping) with one animation loop that wraps the position mathematically, so there is no jump.

It drifts continuously and eases to a stop when you hover.
It flicks with momentum after a drag, and the arrows give a nudge that glides.
Cards near the center scale up slightly.
The five cards are written once and cloned by JS, so the HTML is much shorter.
One behavior changed: the vertical mouse wheel now scrolls the page over the slider, while horizontal trackpad swipes move it. If you want the old "trap the wheel" behavior, set CAPTURE_VERTICAL_WHEEL = true at the top of initScreenSlider().

Copy. I removed everything that described the website instead of the app:

The tags ("Cinematic Walkthrough", "Interactive Simulation", "Core Architecture").
The "scroll with mouse wheel, drag…" hint and the "Download APK Hub" blurb.
The "01 •" numbering on screenshots and the "1080p Native" badge.
The video's three feature cards, which repeated the features section.
The hero headline is now "Log what you eat. See your calories and protein at a glance."

I also swapped Plus Jakarta Sans and the gradient headline word, which read as generic, for Bricolage Grotesque and Hanken Grotesk.

Please check these before publishing:

The SHA-256 checksum on the download tab looks like a placeholder. Replace it with the real hash of your APK.
I reworded the "offline" card to say your logs and goals stay on-device, because the original claimed it never calls a server while your search tiers use FatSecret and Open Food Facts.
"No ads" is in the features subtitle, carried over from your original "0 trackers or ads" stat. Delete it if that's not strictly true.
The video subtitle ("Logging meals, checking the rings, and locking the day") is my guess at what's in the video. Tell me what it actually shows and I'll make it accurate.
Files are in /mnt/user-data/outputs/promo-website/:

index.html
styles.css
script.js
README.md

Index
Code · HTML 

Styles
Code · CSS 

Script
JS 

Readme
Document · MD 





Claude is AI and can make mistakes. Please double-check responses.


Readme · MD
# MacroMax promo site
 
Static promo site for MacroMax, the calorie and protein tracker for Android. Plain HTML, CSS and JS, no build step.
 
## Run locally
 
```bash
cd promo-website
python -m http.server 8000
```
 
Open http://localhost:8000. (Opening `index.html` directly also works, but a local server is better for the video.)
 
## What's on the page
 
- **Animated background**: drifting emerald and cyan light fields, slowly turning macro rings, and a light pointer parallax. Honors `prefers-reduced-motion`.
- **Glass surfaces** with a cursor-tracked highlight, plus hover motion on buttons, cards, icons and the nav.
- **Demo video** with play/pause, mute, scrubbing, and auto-pause when scrolled out of view.
- **Ring simulator**: sliders drive the calorie and protein rings.
- **Screenshot deck**: one screen on top and the rest stacked behind it. Swipe either way and the top card falls the way you pushed it while the next screen comes up through the opposite side (swipe left: falls left, next from the right). The arrows, arrow keys, sideways trackpad and the position bars deal through the deck in a loop the same way, the caption on the right follows along, and the deck deals itself every 6.5s until you take over. Tap a screen to open it full size.
- **Features, stack and download hub** (APK, install steps, build from source).
- **Dark theme only** — the light theme and its navbar toggle were removed.
## Tweaks
 
Top of `initScreenDeck()` in `script.js`:
 
- `AUTOPLAY`: ms between automatic deals. `0` leaves the deck still, and any deliberate input hands the deck over to the visitor for good.
- `DEPTH` / `LIFT` / `SHRINK` / `TILT` / `SCRIM`: how many cards of the stack stay visible and how far back each step sits, shrinks, leans and darkens.
- `FLY`: ms the flicked card takes to leave the deck.
- `SWIPE`: px of drag that commits to the next card.
- `CHAIN`: ms between steps when a bar is clicked several cards away.
## Structure
 
```
promo-website/
├── assets/        favicon.png, macromax_A_ring_1024.png, SC1/2/3/5/6.jpeg
├── video/         brag.mp4
├── downloads/     MacroMax-v1.0.0.apk
├── index.html
├── styles.css
├── script.js
└── README.md
```
 



