## 2024-11-09 - Timeline Play Button UX

**Learning:** When dealing with finite timeline animations, play buttons often appear broken if clicked when the timeline is already at the end. The standard behavior of clearing the interval leaves the UI unchanged and the user confused.

**Action:** Always verify edge cases for media/animation controls. If a user clicks play at the end of a sequence, automatically rewind and restart the sequence.
