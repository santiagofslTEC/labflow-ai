# 0010 rationale: mobile version

**Why now**: every feature of Release 1 and the voice capture are in `main`, and the bench is where LabFlow is used. A pass on the phone found the 15px fields that make iOS zoom, the screen sleeping during a dictation, dialogs and tables laid out for a desk, and an install with no icon.

**Same app, not a second one**: the team chose it. One codebase means a fix to capture or to the variables lands on the phone the same day, and every test covers both. The price is responsive classes in a few components and one hook for the two things CSS cannot do.

**One breakpoint**: spec 0003 picked 1024px so laptops between 1100 and 1280px keep the desktop layout. A second breakpoint for tablets would be a third layout to test; a tablet in a lab is used like a large phone.

**Tab bar over hamburger**: the four destinations are few and fixed, and a thumb reaches the bottom of the screen. The hamburger hides them behind a tap, and its sheet covers the page.

**Notebook tabs**: today the phone shows the header, the capture area, and then the whole data panel in one long column. Capture is the job at the bench; the tables are for checking. Tabs keep capture on the first screen and the rest one tap away, the same split spec 0003's `WorkspaceLayout` already used.

**Sheets in the one dialog**: a full screen sheet is a dialog with other classes. Making it a variant of `components/ui/dialog.tsx` means every dialog, including future ones, gets it, and Radix keeps the focus and Escape behavior. The history entry makes the phone's back gesture close the sheet instead of leaving the notebook, which is what people expect from an app.

**No offline**: every action asks the API (capture, the card, the tables). A cached shell with no data would look broken; the browser's own offline page is honest.

**Playwright**: spec 0003 left "no sideways scroll from 320 to 1920px" to a hand check, and the 15px fields and the missing icons got past it. A small suite at two phone sizes with stubbed API answers is fast, needs no keys, and checks exactly what jsdom cannot.
